(function () {
  'use strict';

  const Rng = window.TambolaRng;
  const Planner = window.TambolaPlanner;
  const Sheet = window.TambolaSheet;
  const Render = window.TambolaRender;
  const Exporter = window.TambolaExport;
  const Ticket = window.TambolaTicket;
  const Pdf = window.TambolaPdf;
  const Png = window.TambolaPng;
  const { Registry, formatSerial } = window.TambolaRegistry;

  // Same registry key as the PNG page, so tickets stay unique across both pages.
  const REG_KEY = 'tambola.registry.v1';
  const SET_KEY = 'tambola.pdf.settings.v1';
  const MAX_WALKIN = 20;
  const COMBINED_WARN = 600;
  const PREVIEW_DPI = 100, OUTPUT_DPI = 300, JPEG_QUALITY = 0.92;
  const $ = function (id) { return document.getElementById(id); };

  // MessageChannel yields are not throttled in background tabs (unlike setTimeout).
  const channel = new MessageChannel();
  const waiting = [];
  channel.port1.onmessage = function () { const r = waiting.shift(); if (r) r(); };
  const tick = function () { return new Promise(function (r) { waiting.push(r); channel.port2.postMessage(0); }); };

  let registry = new Registry();
  let aoa = null, rowOffset = 0, plan = null, workbook = null;
  let cards = [];            // { el, canvas, pf, pageIndex, visible, drawn }  (one per sheet page)
  let blocks = [];           // { el, nameLower }
  let cardByEl = new WeakMap();
  let fileByPerson = new Map(); // personId -> { person, tickets, pageCount, stem, fileName, pngNames }
  let singleNames = new Map();  // serial -> PNG file name in the 'ticket' layout (Name.png, Name_1.png, ...)
  let busy = false;
  let pendingRestore = false;
  let observer = null;
  let toastTimer = null;

  // ---------- storage ----------
  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { showStorageWarning(); return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { showStorageWarning(); return false; }
  }
  function showStorageWarning(msg) {
    const box = $('storageWarning');
    box.textContent = msg || 'Browser storage is unavailable or full. Tickets stay unique during this session, but they will not survive a page reload. Use "Export registry" to keep a copy.';
    box.hidden = false;
  }
  function save() {
    registry.rev++;
    return storageSet(REG_KEY, JSON.stringify(registry.toJSON()));
  }
  function loadRegistry() {
    const raw = storageGet(REG_KEY);
    if (!raw) return;
    try {
      registry = Registry.fromJSON(JSON.parse(raw));
    } catch (e) {
      storageSet(REG_KEY + '.corrupt', raw);
      showStorageWarning('Saved tickets could not be read and were ignored (a copy was kept in browser storage under "' + REG_KEY + '.corrupt").');
      registry = new Registry();
    }
  }
  // Adopt a newer registry saved by another tab or by the PNG page so tickets never collide.
  function syncFromStorage() {
    const raw = storageGet(REG_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if ((data.rev || 0) > registry.rev) {
        registry = Registry.fromJSON(data);
        renderPeople();
        return true;
      }
    } catch (e) { /* keep the in-memory registry */ }
    return false;
  }
  function resetRegistry() {
    const rev = registry.rev;
    registry.reset();
    registry.rev = rev;
    save();
  }

  // ---------- settings ----------
  function getSettings() {
    return {
      heading: $('heading').value.trim(),
      footerText: $('footerText').value.trim(),
      showSerial: $('showSerial').checked,
      showLabel: $('showLabel').checked,
      titleCase: $('titleCase').checked,
      useSeed: $('useSeed').checked,
      seed: $('seed').value.trim(),
      bulkFormat: $('bulkFormat').value,
      layout: $('layout').value
    };
  }
  function persistSettings() {
    const s = getSettings();
    delete s.heading; // heading and footer always start from their defaults
    delete s.footerText;
    storageSet(SET_KEY, JSON.stringify(s));
  }
  function restoreSettings() {
    const raw = storageGet(SET_KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw);
      ['showSerial', 'showLabel', 'titleCase', 'useSeed'].forEach(function (k) { if (typeof s[k] === 'boolean') $(k).checked = s[k]; });
      if (typeof s.seed === 'string') $('seed').value = s.seed;
      if (s.bulkFormat === 'pdf' || s.bulkFormat === 'png') $('bulkFormat').value = s.bulkFormat;
      if (s.layout === 'ticket' || s.layout === 'sheet') $('layout').value = s.layout;
    } catch (e) { /* ignore bad settings */ }
    updateSeedRow();
  }
  function updateSeedRow() { $('seedRow').hidden = !$('useSeed').checked; }

  // ---------- UI helpers ----------
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 5000);
  }
  function showError(msg) { const b = $('errorBox'); b.textContent = msg; b.hidden = false; }
  function clearError() { $('errorBox').hidden = true; }

  function askChoice(title, message, choices) {
    return new Promise(function (resolve) {
      const dlg = $('dlg');
      $('dlgTitle').textContent = title;
      $('dlgMessage').textContent = message;
      const wrap = $('dlgButtons');
      wrap.textContent = '';
      let settled = false;
      const finish = function (value) {
        if (settled) return;
        settled = true;
        dlg.removeEventListener('cancel', onDismiss);
        dlg.removeEventListener('close', onDismiss);
        resolve(value);
      };
      const onDismiss = function () { finish(null); };
      choices.forEach(function (c) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn' + (c.primary ? ' btn-primary' : '') + (c.danger ? ' btn-danger' : '');
        b.textContent = c.label;
        b.addEventListener('click', function () { finish(c.value); if (dlg.open) dlg.close(); });
        wrap.appendChild(b);
      });
      dlg.addEventListener('cancel', onDismiss);
      dlg.addEventListener('close', onDismiss);
      dlg.showModal();
    });
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  // ---------- file loading ----------
  const MSG_LABEL_PROTECTED = 'This workbook is encrypted by a Microsoft sensitivity label (Information Rights Management), so it can only be opened inside Excel. ' +
    'To use it here: open the file in Excel, then either (a) change the sensitivity label at the top of the window to one without encryption and save a copy, or ' +
    '(b) copy the sheet into a new workbook, or (c) File > Save As > CSV UTF-8. Then upload that copy.';
  const MSG_PASSWORD_PROTECTED = 'This workbook is protected with a password. Open it in Excel, remove the password (File > Info > Protect Workbook > Encrypt with Password, clear it) ' +
    'or save a copy as CSV UTF-8, then upload that copy.';

  // True if the UTF-16LE form of `text` occurs in `bytes` (OLE directory entry names are UTF-16LE).
  function containsUtf16(bytes, text) {
    const pat = [];
    for (let i = 0; i < text.length; i++) pat.push(text.charCodeAt(i), 0);
    outer: for (let i = 0; i <= bytes.length - pat.length; i++) {
      if (bytes[i] !== pat[0]) continue;
      for (let j = 1; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer;
      return true;
    }
    return false;
  }

  function sheetHasData(ws) { return !!(ws && ws['!ref']); }

  async function handleFile(file) {
    clearError();
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
      showError('Unsupported file type. Please choose an Excel (.xlsx) or CSV file.');
      return;
    }
    try {
      if (/\.csv$/i.test(file.name)) {
        workbook = XLSX.read(await file.text(), { type: 'string' });
      } else {
        const buf = new Uint8Array(await file.arrayBuffer());
        const isZip = buf[0] === 0x50 && buf[1] === 0x4B;
        const isOle = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
        if (!isZip && !isOle) throw new Error('not an Excel file');
        if (isOle && containsUtf16(buf, 'EncryptedPackage')) {
          const label = containsUtf16(buf, 'DRMEncryptedDataSpace');
          const e = new Error(label ? 'label-protected' : 'password-protected');
          e.userMessage = label ? MSG_LABEL_PROTECTED : MSG_PASSWORD_PROTECTED;
          throw e;
        }
        workbook = XLSX.read(buf, { type: 'array' });
      }
    } catch (e) {
      workbook = null; aoa = null; plan = null; renderSummary();
      showError(e.userMessage || 'This file could not be read. It may be corrupt, or it is not a real Excel file.');
      return;
    }
    $('fileInfo').textContent = file.name;
    const withData = workbook.SheetNames.filter(function (n) { return sheetHasData(workbook.Sheets[n]); });
    const picker = $('sheetPicker');
    picker.textContent = '';
    withData.forEach(function (n) { const o = document.createElement('option'); o.value = n; o.textContent = n; picker.appendChild(o); });
    $('sheetPickerRow').hidden = withData.length < 2;
    if (!withData.length) {
      aoa = null; plan = null; renderSummary();
      showError('The file has no data rows.');
      return;
    }
    loadSheet(withData[0]);
  }

  function loadSheet(name) {
    const ws = workbook.Sheets[name];
    rowOffset = XLSX.utils.decode_range(ws['!ref']).s.r;
    aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true });
    rebuildPlan();
  }

  function rebuildPlan() {
    if (!aoa) return;
    plan = Planner.planFromRows(aoa, { titleCase: $('titleCase').checked, rowOffset: rowOffset });
    renderSummary();
  }

  function renderSummary() {
    const ok = !!(plan && plan.ok);
    $('summary').hidden = !ok;
    $('summaryEmpty').hidden = ok;
    if (plan && !plan.ok) showError(plan.error); else if (plan) clearError();
    $('generateBtn').disabled = !ok || plan.totalTickets === 0 || busy;
    if (!ok) return;
    $('statRows').textContent = plan.rowsRead;
    $('statPeople').textContent = plan.people.length;
    $('statTickets').textContent = plan.totalTickets;
    $('statSkipped').textContent = plan.skippedRows;
    const list = $('warnings');
    list.textContent = '';
    let warns = 0, infos = 0;
    plan.warnings.forEach(function (w) {
      if (w.level === 'warn') warns++; else infos++;
      const li = document.createElement('li');
      li.className = w.level;
      li.textContent = (w.row ? 'Row ' + w.row + ': ' : '') + w.message;
      list.appendChild(li);
    });
    const box = $('warningsBox');
    box.hidden = plan.warnings.length === 0;
    box.open = warns > 0;
    $('warningsSummary').textContent = warns + ' warning' + (warns === 1 ? '' : 's') + ', ' + infos + ' note' + (infos === 1 ? '' : 's');
  }

  // ---------- generation ----------
  function setProgress(done, total, label) {
    const p = $('progress');
    p.hidden = false;
    p.max = total; p.value = done;
    $('progressText').textContent = label + ' ' + done + ' / ' + total;
  }

  async function issuePlanAsync(p, rng) {
    let done = 0;
    let last = performance.now();
    for (const pp of p.people) {
      const person = registry.ensurePerson(pp.key, pp.nameKey, pp.name);
      for (let i = 0; i < pp.total; i++) {
        registry.issue(person.id, 'excel', rng);
        done++;
        if (performance.now() - last > 40) {
          setProgress(done, p.totalTickets, 'Generated');
          await tick();
          last = performance.now();
        }
      }
    }
    registry.rememberUpload(p.fingerprint);
  }

  async function onGenerate() {
    if (busy || !plan || !plan.ok || plan.totalTickets === 0) return;
    busy = true;
    $('generateBtn').disabled = true;
    try {
      syncFromStorage();
      if (registry.ticketCount > 0) {
        const dup = registry.hasUpload(plan.fingerprint);
        const msg = (dup ? 'This file looks like it was already issued. Adding it again creates a second set of tickets for the same people.\n\n' : '') +
          'The registry already holds ' + registry.ticketCount + ' ticket(s) for ' + registry.display().length + ' people. Add the new tickets to it, or replace everything?';
        const choice = await askChoice('Tickets already exist', msg, [
          { label: 'Add to existing', value: 'add', primary: true },
          { label: 'Replace (discard existing)', value: 'replace', danger: true },
          { label: 'Cancel', value: null }
        ]);
        if (!choice) return;
        if (choice === 'replace') resetRegistry();
      }
      const s = getSettings();
      let rng;
      if (s.useSeed) {
        let seed = s.seed;
        if (!seed) { seed = Rng.randomSeed(); $('seed').value = seed; persistSettings(); toast('Seed created: ' + seed); }
        rng = Rng.seededRng(seed);
      } else {
        rng = Rng.cryptoRng();
      }
      pendingRestore = false;
      $('restoreBanner').hidden = true;
      await issuePlanAsync(plan, rng);
      save();
      renderPeople();
      toast('Generated ' + plan.totalTickets + ' tickets for ' + plan.people.length + ' people.');
      $('gallerySection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      save();
      renderPeople();
      showError('Generation stopped: ' + e.message);
    } finally {
      busy = false;
      $('progress').hidden = true;
      $('progressText').textContent = '';
      renderSummary();
    }
  }

  // ---------- walk-ins ----------
  function onWalkin(ev) {
    ev.preventDefault();
    const msg = $('walkinMsg');
    const name = Planner.cleanName($('walkinName').value);
    const raw = $('walkinCount').value.trim();
    const count = Number(raw);
    if (!name) { msg.textContent = 'Please enter a name.'; $('walkinName').focus(); return; }
    if (raw === '' || !Number.isInteger(count) || count < 1 || count > MAX_WALKIN) {
      msg.textContent = 'Number of tickets must be a whole number from 1 to ' + MAX_WALKIN + '.';
      return;
    }
    if (busy) return;
    busy = true;
    try {
      syncFromStorage();
      const display = $('titleCase').checked ? Planner.titleCase(name) : name;
      const nameKey = Planner.nameKeyOf(display);
      const person = registry.findPersonByNameKey(nameKey) || registry.ensurePerson('n:' + nameKey, nameKey, display);
      const rng = Rng.cryptoRng();
      let last = null;
      for (let i = 0; i < count; i++) last = registry.issue(person.id, 'walkin', rng);
      pendingRestore = false;
      $('restoreBanner').hidden = true;
      save();
      renderPeople();
      const pf = fileByPerson.get(person.id);
      msg.textContent = 'Issued ' + count + ' ticket' + (count === 1 ? '' : 's') + ' for ' + person.name + '. ' + person.name + ' now has ' + pf.tickets.length + ' ticket' + (pf.tickets.length === 1 ? '' : 's') + ' in ' + pf.fileName + '.';
      $('walkinName').value = '';
      $('walkinCount').value = '1';
      const card = cards.find(function (c) { return c.pf.person.id === person.id && c.serials.indexOf(last.serial) >= 0; });
      if (card) {
        card.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.el.classList.add('flash');
        setTimeout(function () { card.el.classList.remove('flash'); }, 2500);
      }
    } catch (e) {
      msg.textContent = 'Could not issue tickets: ' + e.message;
    } finally {
      busy = false;
    }
  }

  // ---------- gallery (grouped by person: one block = one PDF; one card = one A4 sheet page) ----------
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function sheetOptions() {
    const s = getSettings();
    return { showSerial: s.showSerial, showLabel: s.showLabel, footerText: s.footerText };
  }

  // Page data for one sheet page of one person (pageIndex is 0-based).
  function personPage(pf, pageIndex) {
    const s = getSettings();
    const first = pageIndex * Pdf.PER_PAGE;
    return {
      title: pf.person.name,
      subtitle: (s.heading ? s.heading + ' · ' : '') + plural(pf.tickets.length, 'ticket'),
      pageNo: pageIndex + 1,
      pageCount: pf.pageCount,
      setOffset: pageIndex * Pdf.SETS_PER_PAGE,
      items: pf.tickets.slice(first, first + Pdf.PER_PAGE).map(function (t, i) {
        return { ticket: t, name: pf.person.name, index: first + i + 1, total: pf.tickets.length };
      })
    };
  }

  // All tickets in registry order, flowing continuously across people (for printing everything on the day).
  function combinedPages() {
    const s = getSettings();
    const items = [];
    fileByPerson.forEach(function (pf) {
      pf.tickets.forEach(function (t, i) { items.push({ ticket: t, name: pf.person.name, index: i + 1, total: pf.tickets.length }); });
    });
    const pages = Pdf.paginate(items);
    return pages.map(function (p, i) {
      return {
        title: (s.heading ? s.heading + ' — ' : '') + 'All tickets',
        subtitle: items.length + ' tickets · ' + fileByPerson.size + ' people',
        pageNo: i + 1,
        pageCount: pages.length,
        setOffset: i * Pdf.SETS_PER_PAGE,
        items: p.items
      };
    });
  }

  function drawCard(card) { card.draw(card.canvas); card.drawn = true; }
  function releaseCard(card) { card.canvas.width = 1; card.canvas.height = 1; card.drawn = false; }
  function redrawAll() { cards.forEach(function (c) { if (c.visible) drawCard(c); else if (c.drawn) releaseCard(c); }); }

  // ---- layout 'ticket' (default): one large branded ticket per image, exactly like the PNG page ----
  function ticketOptions(entry) {
    const s = getSettings();
    return {
      heading: s.heading,
      name: entry.person.name,
      grid: entry.ticket.grid,
      serialText: s.showSerial ? formatSerial(entry.ticket.serial) : '',
      labelText: s.showLabel && entry.total > 1 ? 'Ticket ' + entry.index + ' of ' + entry.total : '',
      footerText: s.footerText
    };
  }

  function makeTicketCard(pf, i, fileName) {
    const t = pf.tickets[i];
    const entry = { ticket: t, person: pf.person, index: i + 1, total: pf.tickets.length };
    const el = document.createElement('div');
    el.className = 'ticket-card';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Ticket ' + formatSerial(t.serial) + ' for ' + pf.person.name);
    el.appendChild(canvas);
    const meta = document.createElement('div');
    meta.className = 'ticket-meta';
    const who = document.createElement('div');
    who.className = 'who';
    const line = document.createElement('span');
    line.textContent = (entry.total > 1 ? 'Ticket ' + entry.index + ' of ' + entry.total + ' · ' : '') + formatSerial(t.serial) + (t.source === 'walkin' ? ' · walk-in' : '');
    const file = document.createElement('span');
    file.textContent = fileName;
    who.append(line, file);
    meta.appendChild(who);
    el.appendChild(meta);
    const card = { el: el, canvas: canvas, pf: pf, serials: [t.serial], visible: false, drawn: false,
      draw: function (c) { Render.drawTicket(c, ticketOptions(entry), 1); } };
    cardByEl.set(el, card);
    return card;
  }

  // ---- layout 'sheet': 12 tickets per A4 page ----
  function makeCard(pf, pageIndex) {
    const el = document.createElement('div');
    el.className = 'ticket-card sheet-card';
    // The preview is cropped to the used part of the page so a short sheet does not show as a tiny ticket on a blank page.
    const used = pf.tickets.slice(pageIndex * Pdf.PER_PAGE, (pageIndex + 1) * Pdf.PER_PAGE).length;
    const last = Pdf.slotPosition(Math.max(0, used - 1));
    const contentH = Math.min(Pdf.PAGE_H, last.y + last.h + 10);
    const clip = document.createElement('div');
    clip.className = 'sheet-clip';
    clip.style.aspectRatio = Pdf.PAGE_W + ' / ' + contentH;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Ticket sheet page ' + (pageIndex + 1) + ' of ' + pf.pageCount + ' for ' + pf.person.name);
    clip.appendChild(canvas);
    el.appendChild(clip);
    const first = pageIndex * Pdf.PER_PAGE;
    const card = { el: el, canvas: canvas, pf: pf, pageIndex: pageIndex, visible: false, drawn: false,
      serials: pf.tickets.slice(first, first + Pdf.PER_PAGE).map(function (t) { return t.serial; }),
      draw: function (c) { Sheet.drawSheetPage(c, personPage(pf, pageIndex), sheetOptions(), PREVIEW_DPI); } };
    cardByEl.set(el, card);
    return card;
  }

  function currentLayout() { return $('layout').value === 'sheet' ? 'sheet' : 'ticket'; }

  function renderPeople() {
    if (observer) observer.disconnect();
    const host = $('people');
    host.textContent = '';
    cards = []; blocks = [];
    cardByEl = new WeakMap();
    fileByPerson = new Map();
    const layout = currentLayout();

    const display = registry.display();
    singleNames = new Map(Exporter.buildFileList(display).map(function (f) { return [f.serial, f.fileName]; }));
    Pdf.buildPersonFiles(display).forEach(function (pf) {
      fileByPerson.set(pf.person.id, pf);
      const block = document.createElement('div');
      block.className = 'person-block';

      const head = document.createElement('div');
      head.className = 'person-head';
      const who = document.createElement('div');
      who.className = 'who';
      const strong = document.createElement('strong');
      strong.textContent = pf.person.name;
      const sub = document.createElement('span');
      sub.textContent = layout === 'ticket'
        ? plural(pf.tickets.length, 'ticket') + ' · ' + pf.fileName
        : plural(pf.tickets.length, 'ticket') + ' · ' + plural(pf.pageCount, 'page') + ' · ' + pf.fileName;
      who.append(strong, sub);
      const actions = document.createElement('div');
      actions.className = 'person-actions';
      const multiPng = layout === 'ticket' ? pf.tickets.length > 1 : pf.pageCount > 1;
      [['pdf', 'Download PDF', 'btn btn-primary'], ['png', multiPng ? 'Download PNG (ZIP)' : 'Download PNG', 'btn']].forEach(function (d) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = d[2];
        b.textContent = d[1];
        b.dataset.person = String(pf.person.id);
        b.dataset.format = d[0];
        actions.appendChild(b);
      });
      head.append(who, actions);
      block.appendChild(head);

      const grid = document.createElement('div');
      grid.className = layout === 'ticket' ? 'gallery' : 'gallery pages';
      if (layout === 'ticket') {
        pf.tickets.forEach(function (t, i) {
          const card = makeTicketCard(pf, i, singleNames.get(t.serial));
          cards.push(card);
          grid.appendChild(card.el);
        });
      } else {
        for (let p = 0; p < pf.pageCount; p++) {
          const card = makeCard(pf, p);
          cards.push(card);
          grid.appendChild(card.el);
        }
      }
      block.appendChild(grid);
      host.appendChild(block);
      blocks.push({ el: block, nameLower: pf.person.name.toLowerCase() });
    });

    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        const card = cardByEl.get(en.target);
        if (!card) return;
        card.visible = en.isIntersecting;
        if (en.isIntersecting && !card.drawn) drawCard(card);
        else if (!en.isIntersecting && card.drawn) releaseCard(card);
      });
    }, { rootMargin: '400px' });
    cards.forEach(function (c) { observer.observe(c.el); });

    const has = cards.length > 0;
    $('gallerySection').hidden = pendingRestore;
    $('galleryEmpty').hidden = has;
    ['downloadAllBtn', 'downloadCombinedBtn', 'downloadCsvBtn', 'exportRegBtn', 'resetBtn'].forEach(function (id) { $(id).disabled = !has; });
    $('bulkFormat').disabled = !has;
    $('filter').disabled = !has;
    $('galleryStats').textContent = has ? '— ' + plural(registry.ticketCount, 'ticket') + ' · ' + plural(display.length, 'person').replace('persons', 'people') + (layout === 'sheet' ? ' · ' + plural(cards.length, 'page') : '') : '';
    applyFilter();
    updateSelfCheck();
  }

  function applyFilter() {
    const q = $('filter').value.trim().toLowerCase();
    blocks.forEach(function (b) { b.el.classList.toggle('hidden', !!q && b.nameLower.indexOf(q) < 0); });
  }

  // Re-checks every issued ticket against the published rules and shows the result in the rules panel.
  function updateSelfCheck() {
    const el = $('selfCheck');
    const ts = registry.tickets;
    if (!ts.length) {
      el.className = 'selfcheck';
      el.textContent = 'No tickets issued yet. Once tickets exist, they are re-checked against these rules here.';
      return;
    }
    let valid = 0, rowTotal = 0;
    const keys = new Set(), rows = new Set();
    ts.forEach(function (t) {
      if (Ticket.validateTicket(t.grid).ok) valid++;
      keys.add(Ticket.ticketKey(t.grid));
      Ticket.rowKeys(t.grid).forEach(function (k) { rows.add(k); rowTotal++; });
    });
    const ok = valid === ts.length && keys.size === ts.length && rows.size === rowTotal;
    el.className = 'selfcheck ' + (ok ? 'ok' : 'bad');
    el.textContent = (ok ? '✔ ' : '✖ ') + 'Re-checked just now: ' + valid + ' of ' + ts.length + ' issued tickets follow every rule above; ' +
      keys.size + ' distinct tickets; ' + rows.size + ' of ' + rowTotal + ' rows distinct.';
  }

  // ---------- PDF / PNG creation (same renderer for preview, PNG and PDF) ----------
  // An "output" is one image / PDF page: { draw(canvas), dpi, orientation, pngName }.
  const pageCanvas = document.createElement('canvas'); // offscreen, reused for every output

  function drawOutput(out) { out.draw(pageCanvas); }

  async function pagePngBlob(out) {
    drawOutput(out);
    const raw = await new Promise(function (resolve, reject) {
      pageCanvas.toBlob(function (b) { b ? resolve(b) : reject(new Error('PNG export failed')); }, 'image/png');
    });
    try {
      return new Blob([Png.setDpi(new Uint8Array(await raw.arrayBuffer()), out.dpi)], { type: 'image/png' }); // embeds the print size
    } catch (e) { return raw; }
  }

  function pageJpeg(out) {
    drawOutput(out);
    return { data: pageCanvas.toDataURL('image/jpeg', JPEG_QUALITY), format: 'JPEG', orientation: out.orientation };
  }

  // A 12-per-page sheet page as an output.
  function sheetOutput(page, pngName) {
    return { draw: function (c) { Sheet.drawSheetPage(c, page, sheetOptions(), OUTPUT_DPI); }, dpi: OUTPUT_DPI, orientation: 'portrait', pngName: pngName };
  }

  // Outputs for one person in the chosen layout.
  function personOutputs(pf) {
    if (currentLayout() === 'sheet') {
      const outs = [];
      for (let p = 0; p < pf.pageCount; p++) outs.push(sheetOutput(personPage(pf, p), pf.pngNames[p]));
      return outs;
    }
    // 'ticket': the original look, one ticket on an A4 landscape sheet per image / PDF page
    return pf.tickets.map(function (t, i) {
      const entry = { ticket: t, person: pf.person, index: i + 1, total: pf.tickets.length };
      return { draw: function (c) { Render.drawSheet(c, ticketOptions(entry), 'landscape'); }, dpi: Render.SHEET_DPI, orientation: 'landscape', pngName: singleNames.get(t.serial) };
    });
  }

  // outs: array of outputs. Returns a PDF Blob.
  async function pagesPdfBlob(outs, title, onStep) {
    const images = [];
    for (let i = 0; i < outs.length; i++) {
      images.push(pageJpeg(outs[i]));
      if (onStep) onStep(i + 1, outs.length);
      await tick();
    }
    return Pdf.buildPdf(window.jspdf.jsPDF, images, { title: title }).output('blob');
  }

  // Returns [{ name, blob }] for the given outputs.
  async function pagesPngFiles(outs, onStep) {
    const out = [];
    for (let i = 0; i < outs.length; i++) {
      out.push({ name: outs[i].pngName, blob: await pagePngBlob(outs[i]) });
      if (onStep) onStep(i + 1, outs.length);
      await tick();
    }
    return out;
  }

  function showZipProgress(done, total, label) {
    $('zipProgressRow').hidden = false;
    $('zipProgress').max = total; $('zipProgress').value = done;
    $('zipProgressText').textContent = label + ' ' + done + ' / ' + total;
  }

  async function zipBlob(files) {
    const zip = new JSZip();
    files.forEach(function (f) { zip.file(f.name, f.blob); });
    return zip.generateAsync({ type: 'blob', compression: 'STORE' }, function (m) {
      $('zipProgress').max = 100; $('zipProgress').value = m.percent; $('zipProgressText').textContent = 'Packing ' + Math.round(m.percent) + '%';
    });
  }

  async function downloadPerson(personId, format) {
    const pf = fileByPerson.get(personId);
    if (!pf || busy) return;
    busy = true;
    try {
      const pages = personOutputs(pf);
      if (format === 'png') {
        const files = await pagesPngFiles(pages);
        if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
        else { showZipProgress(0, 1, 'Packing'); downloadBlob(await zipBlob(files), pf.stem + '_png.zip'); }
      } else {
        downloadBlob(await pagesPdfBlob(pages, pf.person.name + ' — Tambola tickets'), pf.fileName);
      }
    } catch (e) { toast((format === 'png' ? 'PNG' : 'PDF') + ' failed: ' + e.message); } finally { $('zipProgressRow').hidden = true; busy = false; }
  }

  async function downloadAll() {
    if (busy || !cards.length) return;
    const format = $('bulkFormat').value;
    busy = true;
    try {
      const files = Array.from(fileByPerson.values());
      const out = [];
      for (let i = 0; i < files.length; i++) {
        const pf = files[i], pages = personOutputs(pf);
        if (format === 'png') (await pagesPngFiles(pages)).forEach(function (f) { out.push(f); });
        else out.push({ name: pf.fileName, blob: await pagesPdfBlob(pages, pf.person.name + ' — Tambola tickets') });
        showZipProgress(i + 1, files.length, 'People');
      }
      downloadBlob(await zipBlob(out), format === 'png' ? 'Tambola_Tickets_PNG.zip' : 'Tambola_Tickets_PDF.zip');
      toast('Downloaded ' + plural(out.length, format === 'png' ? 'PNG' : 'PDF') + ' for ' + plural(files.length, 'person').replace('persons', 'people') + '.');
    } catch (e) { toast('ZIP failed: ' + e.message); } finally { $('zipProgressRow').hidden = true; busy = false; }
  }

  // Always the 12-per-page sheets, flowing across people: the way to print everything on the day.
  async function downloadCombined() {
    if (busy || !cards.length) return;
    const format = $('bulkFormat').value;
    const pages = combinedPages();
    if (registry.ticketCount > COMBINED_WARN) {
      const ok = await askChoice('Large download', 'The combined sheets will hold ' + registry.ticketCount + ' tickets (' + pages.length + ' pages). It may take a while and use a lot of memory.', [
        { label: 'Create it', value: true, primary: true }, { label: 'Cancel', value: null }
      ]);
      if (!ok) return;
    }
    busy = true;
    try {
      const outs = pages.map(function (p, i) { return sheetOutput(p, 'Tambola_All_Tickets_p' + String(i + 1).padStart(2, '0') + '.png'); });
      const progress = function (done, total) { showZipProgress(done, total, 'Rendering page'); };
      if (format === 'png') {
        downloadBlob(await zipBlob(await pagesPngFiles(outs, progress)), 'Tambola_All_Tickets_PNG.zip');
      } else {
        downloadBlob(await pagesPdfBlob(outs, 'Tambola tickets — all', progress), 'Tambola_All_Tickets.pdf');
      }
      toast('Combined ' + format.toUpperCase() + ': ' + plural(registry.ticketCount, 'ticket') + ' on ' + plural(pages.length, 'page') + '.');
    } catch (e) { toast('Combined download failed: ' + e.message); } finally { $('zipProgressRow').hidden = true; busy = false; }
  }

  function stamp() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function downloadCsv() {
    downloadBlob(new Blob([Pdf.buildCsv(registry.display(), currentLayout())], { type: 'text/csv;charset=utf-8' }), 'tambola_tickets.csv');
  }
  function exportRegistry() {
    downloadBlob(new Blob([JSON.stringify(registry.toJSON())], { type: 'application/json' }), 'tambola_registry_' + stamp() + '.json');
  }

  async function importRegistry(file) {
    let imported;
    try {
      imported = Registry.fromJSON(JSON.parse(await file.text()));
    } catch (e) {
      const details = e.errors ? '\n\n' + e.errors.slice(0, 5).join('\n') : '';
      await askChoice('Import failed', 'This is not a valid registry file.' + details, [{ label: 'OK', value: true, primary: true }]);
      return;
    }
    if (registry.ticketCount > 0) {
      const choice = await askChoice('Import registry',
        'The file holds ' + imported.ticketCount + ' ticket(s). The current registry holds ' + registry.ticketCount + '. Replace it, or merge (conflicting tickets are skipped)?', [
          { label: 'Merge', value: 'merge', primary: true },
          { label: 'Replace', value: 'replace', danger: true },
          { label: 'Cancel', value: null }
        ]);
      if (!choice) return;
      if (choice === 'merge') {
        const r = registry.merge(imported);
        toast('Merged: ' + r.added + ' added, ' + r.skipped + ' skipped as duplicates.');
      } else {
        imported.rev = Math.max(registry.rev, imported.rev) + 1;
        registry = imported;
        toast('Registry replaced with ' + imported.ticketCount + ' tickets.');
      }
    } else {
      imported.rev = Math.max(registry.rev, imported.rev) + 1;
      registry = imported;
      toast('Imported ' + imported.ticketCount + ' tickets.');
    }
    pendingRestore = false;
    $('restoreBanner').hidden = true;
    save();
    renderPeople();
  }

  async function onReset() {
    const choice = await askChoice('Reset registry', 'This permanently removes all ' + registry.ticketCount + ' issued tickets and restarts serial numbers. The PNG page shares this registry, so it is cleared there too. Export the registry first if you may need it.', [
      { label: 'Reset everything', value: true, danger: true },
      { label: 'Cancel', value: null, primary: true }
    ]);
    if (!choice) return;
    resetRegistry();
    renderPeople();
    $('walkinMsg').textContent = '';
    toast('Registry cleared.');
  }

  // ---------- init ----------
  function init() {
    restoreSettings();
    loadRegistry();
    if (registry.ticketCount > 0) {
      pendingRestore = true;
      $('restoreText').textContent = 'Saved session found: ' + registry.ticketCount + ' tickets for ' + registry.display().length + ' people.';
      $('restoreBanner').hidden = false;
    }
    renderPeople();
    renderSummary();

    const fileInput = $('fileInput'), dz = $('dropzone');
    fileInput.addEventListener('change', function () {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
      fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); });
    });
    dz.addEventListener('drop', function (e) {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      if (files.length > 1) toast('Several files dropped; using "' + files[0].name + '".');
      handleFile(files[0]);
    });
    ['dragover', 'drop'].forEach(function (ev) { window.addEventListener(ev, function (e) { e.preventDefault(); }); });

    $('sheetPicker').addEventListener('change', function (e) { loadSheet(e.target.value); });
    $('generateBtn').addEventListener('click', onGenerate);
    $('walkinForm').addEventListener('submit', onWalkin);
    $('downloadAllBtn').addEventListener('click', downloadAll);
    $('downloadCombinedBtn').addEventListener('click', downloadCombined);
    $('downloadCsvBtn').addEventListener('click', downloadCsv);
    $('exportRegBtn').addEventListener('click', exportRegistry);
    $('importRegBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      const f = e.target.files[0];
      if (f) importRegistry(f);
      e.target.value = '';
    });
    $('resetBtn').addEventListener('click', onReset);
    $('filter').addEventListener('input', applyFilter);
    $('people').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-person]');
      if (b) downloadPerson(Number(b.dataset.person), b.dataset.format);
    });

    $('restoreContinue').addEventListener('click', function () {
      pendingRestore = false;
      $('restoreBanner').hidden = true;
      renderPeople();
    });
    $('restoreFresh').addEventListener('click', async function () {
      const choice = await askChoice('Start fresh', 'Discard the ' + registry.ticketCount + ' saved tickets and start over? The PNG page shares this registry, so it is cleared there too.', [
        { label: 'Discard saved tickets', value: true, danger: true },
        { label: 'Cancel', value: null, primary: true }
      ]);
      if (!choice) return;
      resetRegistry();
      pendingRestore = false;
      $('restoreBanner').hidden = true;
      renderPeople();
    });

    ['heading', 'footerText', 'showSerial', 'showLabel'].forEach(function (id) {
      $(id).addEventListener('input', function () { persistSettings(); redrawAll(); });
    });
    $('titleCase').addEventListener('change', function () { persistSettings(); rebuildPlan(); });
    $('useSeed').addEventListener('change', function () { updateSeedRow(); persistSettings(); });
    $('bulkFormat').addEventListener('change', persistSettings);
    $('layout').addEventListener('change', function () { persistSettings(); renderPeople(); });
    $('seed').addEventListener('input', persistSettings);

    window.addEventListener('storage', function (e) {
      if (e.key === REG_KEY && syncFromStorage()) toast('Tickets were updated in another tab or page; this view was refreshed.');
    });
  }

  init();
})();
