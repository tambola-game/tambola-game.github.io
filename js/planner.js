/* Turns spreadsheet rows (array of arrays, first non-empty row = header) into a ticket plan. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TambolaPlanner = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SANITY_WARN = 50;
  const HARD_CAP = 1000;

  function norm(s) {
    return String(s == null ? '' : s).replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function cleanName(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function titleCase(s) {
    return s.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); });
  }

  function isBlank(v) {
    return v === null || v === undefined || String(v).trim() === '';
  }

  function findColumns(header) {
    const cols = { name: -1, email: -1, count: -1, donated: -1, confirm: -1 };
    header.forEach(function (h, i) {
      const n = norm(h);
      if (!n) return;
      if (cols.name < 0 && n === 'name') cols.name = i;
      else if (cols.email < 0 && (n === 'email' || n === 'e-mail' || n === 'email address')) cols.email = i;
      else if (cols.count < 0 && n.indexOf('how many tickets') === 0) cols.count = i;
      else if (cols.donated < 0 && n.indexOf('donated to other cause') === 0) cols.donated = i;
      else if (cols.confirm < 0 && n.indexOf('i confirm my donation') === 0) cols.confirm = i;
    });
    return cols;
  }

  // -> { status: 'blank'|'ok'|'invalid', value, floored }
  function parseCount(v) {
    if (isBlank(v)) return { status: 'blank' };
    let num;
    if (typeof v === 'number') num = v;
    else {
      const s = String(v).trim();
      if (s !== '' && isFinite(Number(s))) num = Number(s);
      else {
        const m = /^(-?\d+(?:\.\d+)?)/.exec(s);
        if (!m) return { status: 'invalid' };
        num = Number(m[1]);
      }
    }
    if (!isFinite(num)) return { status: 'invalid' };
    const floored = Math.floor(num);
    return { status: 'ok', value: floored, floored: floored !== num };
  }

  function parseTextCount(v) {
    if (isBlank(v)) return { n: null, multiple: false, amountOnly: false };
    const text = String(v);
    const re = /\(\s*(\d+)\s*tickets?\s*\)/ig;
    const matches = [];
    let m;
    while ((m = re.exec(text))) matches.push(parseInt(m[1], 10));
    const hasAmount = /(₹|\brs\.?|\binr\b)\s*\d/i.test(text);
    return { n: matches.length ? matches[0] : null, multiple: matches.length > 1, amountOnly: matches.length === 0 && hasAmount };
  }

  function hashString(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function nameKeyOf(name) { return cleanName(name).toLowerCase(); }

  /**
   * rows: array of arrays. options: { titleCase: boolean, rowOffset: number (index of rows[0] in sheet, 0-based) }
   */
  function planFromRows(rows, options) {
    options = options || {};
    const offset = options.rowOffset || 0;
    const result = { ok: false, error: null, people: [], warnings: [], rowsRead: 0, totalTickets: 0, skippedRows: 0, columns: null, fingerprint: '' };
    const warn = function (row, level, message) { result.warnings.push({ row: row, level: level, message: message }); };

    const isEmptyRow = function (r) { return !Array.isArray(r) || r.every(isBlank); };
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) { if (!isEmptyRow(rows[i])) { headerIdx = i; break; } }
    if (headerIdx < 0) { result.error = 'The file has no data rows.'; return result; }

    const cols = findColumns(rows[headerIdx]);
    result.columns = cols;
    if (cols.name < 0) { result.error = 'The "Name" column was not found. Make sure the header row contains a column named exactly "Name".'; return result; }
    if (cols.count < 0) warn(0, 'warn', 'Ticket-count column ("How many tickets…") not found; tickets are resolved from the "Donated to other cause(s)" text or default to 1.');
    if (cols.email < 0) warn(0, 'info', '"Email" column not found; people are grouped by Name.');

    const groups = new Map();
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i];
      if (isEmptyRow(r)) continue;
      const rowNum = i + offset + 1;
      result.rowsRead++;

      let name = cleanName(r[cols.name]);
      if (!name) { result.skippedRows++; warn(rowNum, 'warn', 'Row skipped: Name is empty.'); continue; }
      if (options.titleCase) name = titleCase(name);

      const count = cols.count >= 0 ? parseCount(r[cols.count]) : { status: 'blank' };
      const text = cols.donated >= 0 ? parseTextCount(r[cols.donated]) : { n: null, multiple: false, amountOnly: false };

      let tickets;
      if (count.status === 'ok' && count.value < 0) {
        result.skippedRows++; warn(rowNum, 'warn', 'Row skipped: negative ticket count (' + count.value + ').'); continue;
      }
      if (count.status === 'ok' || text.n !== null) {
        const c = count.status === 'ok' ? count.value : 0;
        tickets = c + (text.n || 0);
        if (count.status === 'ok' && count.floored) warn(rowNum, 'warn', 'Decimal ticket count rounded down to ' + count.value + '.');
        if (count.status === 'ok' && text.n !== null) warn(rowNum, 'info', 'Both a ticket count (' + c + ') and "(' + text.n + ' tickets)" text were found; added together (' + tickets + ').');
        if (text.multiple) warn(rowNum, 'warn', 'Multiple "(N tickets)" fragments found in the text; only the first was used.');
        if (tickets === 0) { result.skippedRows++; warn(rowNum, 'warn', 'Row has 0 tickets and was not ticketed.'); continue; }
      } else {
        tickets = 1;
        if (count.status === 'invalid') warn(rowNum, 'warn', 'Ticket count "' + String(r[cols.count]).trim() + '" is not a number; defaulted to 1 ticket.');
        if (text.amountOnly) warn(rowNum, 'warn', 'An amount was found without "(N tickets)"; amount is not converted, defaulted to 1 ticket.');
      }
      if (tickets > HARD_CAP) { result.skippedRows++; warn(rowNum, 'warn', 'Row skipped: ' + tickets + ' tickets exceeds the limit of ' + HARD_CAP + '.'); continue; }
      if (tickets > SANITY_WARN) warn(rowNum, 'warn', 'Unusually large request: ' + tickets + ' tickets.');
      if (cols.confirm >= 0 && /^\s*no\b/i.test(String(r[cols.confirm] == null ? '' : r[cols.confirm]))) {
        warn(rowNum, 'info', 'Voluntary-donation confirmation is "No"; tickets were still issued.');
      }

      const email = cols.email >= 0 ? String(r[cols.email] == null ? '' : r[cols.email]).trim().toLowerCase() : '';
      const nameKey = nameKeyOf(name);
      const key = email ? 'e:' + email : 'n:' + nameKey;
      let g = groups.get(key);
      if (!g) {
        g = { key: key, nameKey: nameKey, name: name, rows: [], total: 0 };
        groups.set(key, g);
      } else if (g.rows.length === 1) {
        warn(rowNum, 'info', 'Merged with earlier row ' + g.rows[0].rowNum + ' for "' + g.name + '".');
      } else {
        warn(rowNum, 'info', 'Merged with earlier rows for "' + g.name + '".');
      }
      g.rows.push({ rowNum: rowNum, tickets: tickets });
      g.total += tickets;
    }

    result.people = Array.from(groups.values());
    result.totalTickets = result.people.reduce(function (s, p) { return s + p.total; }, 0);
    result.fingerprint = hashString(result.people.map(function (p) { return p.key + '|' + p.name + '|' + p.total; }).join('\n'));
    result.ok = true;
    if (result.rowsRead === 0) { result.ok = false; result.error = 'The file has no data rows.'; }
    return result;
  }

  return { planFromRows, findColumns, parseCount, parseTextCount, titleCase, cleanName, nameKeyOf, hashString, SANITY_WARN, HARD_CAP };
});
