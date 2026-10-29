/* File naming and CSV export helpers (pure functions). */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./ticket.js') : root.TambolaTicket, isNode ? require('./registry.js') : root.TambolaRegistry);
  if (isNode) module.exports = api;
  else root.TambolaExport = api;
})(typeof self !== 'undefined' ? self : this, function (Ticket, RegistryMod) {
  'use strict';

  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  const MAX_STEM = 100;

  function sanitizeName(name) {
    let s = String(name == null ? '' : name)
      .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '');
    if (s.length > MAX_STEM) s = Array.from(s).slice(0, MAX_STEM).join('').trim().replace(/[. ]+$/, '');
    if (RESERVED.test(s)) s = '_' + s;
    return s;
  }

  /**
   * display: output of Registry.display(). Returns an array parallel to the flattened ticket list:
   * [{ serial, personId, name, index (1-based), total, fileName }]
   */
  function buildFileList(display) {
    const out = [];
    const usedStems = new Map(); // lower-case person stem -> count
    const usedFiles = new Set();
    display.forEach(function (g) {
      let stem = sanitizeName(g.person.name);
      if (!stem) stem = 'Ticket_' + g.tickets[0].serial;
      const lower = stem.toLowerCase();
      const n = (usedStems.get(lower) || 0) + 1;
      usedStems.set(lower, n);
      if (n > 1) stem = stem + ' (' + n + ')';
      const total = g.tickets.length;
      g.tickets.forEach(function (t, i) {
        const base = total === 1 ? stem : stem + '_' + (i + 1);
        let file = base + '.png';
        let k = 2;
        while (usedFiles.has(file.toLowerCase())) { file = base + ' (' + (k++) + ').png'; }
        usedFiles.add(file.toLowerCase());
        out.push({ serial: t.serial, personId: g.person.id, name: g.person.name, index: i + 1, total: total, fileName: file });
      });
    });
    return out;
  }

  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function buildCsv(display) {
    const files = buildFileList(display);
    const bySerial = new Map(files.map(function (f) { return [f.serial, f]; }));
    const header = ['Ticket ID', 'Name', 'Ticket No.', 'Tickets For Person', 'File name', 'Source', 'Row 1', 'Row 2', 'Row 3', 'All numbers'];
    const lines = [header.join(',')];
    display.forEach(function (g) {
      g.tickets.forEach(function (t) {
        const f = bySerial.get(t.serial);
        const rows = t.grid.map(function (r) { return r.filter(Boolean).join(' '); });
        lines.push([
          RegistryMod.formatSerial(t.serial), g.person.name, f.index, f.total, f.fileName, t.source,
          rows[0], rows[1], rows[2], Ticket.allNumbers(t.grid).join(' ')
        ].map(csvCell).join(','));
      });
    });
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  return { sanitizeName, buildFileList, buildCsv, csvCell };
});
