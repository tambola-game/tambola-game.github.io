(function () {
  'use strict';

  const Rng = window.TambolaRng;
  const Planner = window.TambolaPlanner;
  const Exporter = window.TambolaExport;
  const Render = window.TambolaRender;
  const Png = window.TambolaPng;
  const Ticket = window.TambolaTicket;
  const { Registry, formatSerial } = window.TambolaRegistry;

  const REG_KEY = 'tambola.registry.v1';
  const SET_KEY = 'tambola.settings.v3';
  const MAX_WALKIN = 20;
  const $ = function (id) { return document.getElementById(id); };
  // MessageChannel yields are not throttled in background tabs (unlike setTimeout).
  const channel = new MessageChannel();
  const waiting = [];
  channel.port1.onmessage = function () { const r = waiting.shift(); if (r) r(); };
  const tick = function () { return new Promise(function (r) { waiting.push(r); channel.port2.postMessage(0); }); };

  let registry = new Registry();
  let aoa = null, rowOffset = 0, plan = null, workbook = null;
  let cards = [];
  let cardByEl = new WeakMap();
  let ticketIndex = new Map(); // serial -> { ticket, person, info }
  let busy = false;
  let pendingRestore = false;
  let observer = null;
  let toastTimer = null;
  const offscreen = document.createElement('canvas');

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
  // Adopt a newer registry saved by another tab so tickets never collide across tabs.
  function syncFromStorage() {
    const raw = storageGet(REG_KEY);
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if ((data.rev || 0) > registry.rev) {
        registry = Registry.fromJSON(data);
        renderGallery();
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
      pngLayout: $('pngLayout').value,
      seed: $('seed').value.trim()
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
      if (['landscape', 'portrait', 'ticket'].indexOf(s.pngLayout) >= 0) $('pngLayout').value = s.pngLayout;
      if (typeof s.seed === 'string') $('seed').value = s.seed;
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
      renderGallery();
      toast('Generated ' + plan.totalTickets + ' tickets for ' + plan.people.length + ' people.');
      $('gallerySection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      save();
      renderGallery();
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
      renderGallery();
      const files = [];
      registry.ticketsOf(person.id).forEach(function (t) { files.push(ticketIndex.get(t.serial).info.fileName); });
      msg.textContent = 'Issued ' + count + ' ticket' + (count === 1 ? '' : 's') + ' for ' + person.name + '. Files: ' + files.join(', ');
      $('walkinName').value = '';
      $('walkinCount').value = '1';
      const card = cards.find(function (c) { return c.serial === last.serial; });
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

  // ---------- gallery ----------
  function ticketOptions(entry) {
    const s = getSettings();
    const info = entry.info;
    return {
      heading: s.heading,
      footerText: s.footerText,
      name: entry.person.name,
      grid: entry.ticket.grid,
      serialText: s.showSerial ? formatSerial(entry.ticket.serial) : '',
      labelText: s.showLabel && info.total > 1 ? 'Ticket ' + info.index + ' of ' + info.total : ''
    };
  }

  function drawCard(card) {
    Render.drawTicket(card.canvas, ticketOptions(ticketIndex.get(card.serial)), 1);
    card.drawn = true;
  }
  function releaseCard(card) {
    card.canvas.width = 1; card.canvas.height = 1;
    card.drawn = false;
  }
  function redrawAll() {
    cards.forEach(function (c) { if (c.visible) drawCard(c); else if (c.drawn) releaseCard(c); });
  }

  function makeCard(entry) {
    const t = entry.ticket, info = entry.info;
    const el = document.createElement('div');
    el.className = 'ticket-card';
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Ticket ' + formatSerial(t.serial) + ' for ' + entry.person.name);
    el.appendChild(canvas);
    const meta = document.createElement('div');
    meta.className = 'ticket-meta';
    const who = document.createElement('div');
    who.className = 'who';
    const strong = document.createElement('strong');
    strong.textContent = entry.person.name;
    const line = document.createElement('span');
    line.textContent = (info.total > 1 ? 'Ticket ' + info.index + ' of ' + info.total + ' · ' : '') + formatSerial(t.serial) + (t.source === 'walkin' ? ' · walk-in' : '');
    const file = document.createElement('span');
    file.textContent = info.fileName;
    who.append(strong, line, file);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = 'Download PNG';
    btn.dataset.serial = String(t.serial);
    meta.append(who, btn);
    el.appendChild(meta);
    const card = { el: el, canvas: canvas, serial: t.serial, visible: false, drawn: false, nameLower: entry.person.name.toLowerCase() };
    cardByEl.set(el, card);
    return card;
  }

  function renderGallery() {
    if (observer) observer.disconnect();
    const gallery = $('gallery');
    gallery.textContent = '';
    cards = [];
    cardByEl = new WeakMap();
    ticketIndex = new Map();

    const display = registry.display();
    const files = Exporter.buildFileList(display);
    const infoBySerial = new Map(files.map(function (f) { return [f.serial, f]; }));
    const frag = document.createDocumentFragment();
    display.forEach(function (g) {
      g.tickets.forEach(function (t) {
        const entry = { ticket: t, person: g.person, info: infoBySerial.get(t.serial) };
        ticketIndex.set(t.serial, entry);
        const card = makeCard(entry);
        cards.push(card);
        frag.appendChild(card.el);
      });
    });
    gallery.appendChild(frag);

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
    ['downloadAllBtn', 'downloadCsvBtn', 'exportRegBtn', 'resetBtn'].forEach(function (id) { $(id).disabled = !has; });
    $('filter').disabled = !has;
    $('galleryStats').textContent = has ? '— ' + cards.length + ' tickets · ' + display.length + ' people' : '';
    applyFilter();
    updateSelfCheck();
  }

  function applyFilter() {
    const q = $('filter').value.trim().toLowerCase();
    cards.forEach(function (c) { c.el.classList.toggle('hidden', !!q && c.nameLower.indexOf(q) < 0); });
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

  // ---------- downloads ----------
  async function renderBlob(serial) {
    const opts = ticketOptions(ticketIndex.get(serial));
    const layout = $('pngLayout').value;
    const sheet = layout === 'landscape' || layout === 'portrait';
    if (sheet) Render.drawSheet(offscreen, opts, layout); else Render.drawTicket(offscreen, opts, 2);
    const raw = await new Promise(function (resolve, reject) {
      offscreen.toBlob(function (b) { b ? resolve(b) : reject(new Error('PNG export failed')); }, 'image/png');
    });
    // Embed the print size so viewers and printers that honour it use the intended physical dimensions.
    try {
      const bytes = Png.setDpi(new Uint8Array(await raw.arrayBuffer()), sheet ? Render.SHEET_DPI : Render.TICKET_DPI);
      return new Blob([bytes], { type: 'image/png' });
    } catch (e) {
      return raw;
    }
  }

  async function downloadOne(serial) {
    try {
      const blob = await renderBlob(serial);
      downloadBlob(blob, ticketIndex.get(serial).info.fileName);
    } catch (e) { toast('Download failed: ' + e.message); }
  }

  async function downloadAll() {
    if (busy || !cards.length) return;
    busy = true;
    const row = $('zipProgressRow'), bar = $('zipProgress'), txt = $('zipProgressText');
    row.hidden = false;
    try {
      const zip = new JSZip();
      const serials = cards.map(function (c) { return c.serial; });
      for (let i = 0; i < serials.length; i++) {
        const blob = await renderBlob(serials[i]);
        zip.file(ticketIndex.get(serials[i]).info.fileName, blob);
        bar.max = serials.length; bar.value = i + 1;
        txt.textContent = 'Rendering ' + (i + 1) + ' / ' + serials.length;
        if (i % 5 === 4) await tick();
      }
      bar.max = 100;
      const out = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, function (m) {
        bar.value = m.percent; txt.textContent = 'Packing ' + Math.round(m.percent) + '%';
      });
      downloadBlob(out, 'Tambola_Tickets.zip');
      toast('Downloaded ' + serials.length + ' tickets.');
    } catch (e) {
      toast('ZIP failed: ' + e.message);
    } finally {
      row.hidden = true;
      busy = false;
    }
  }

  function stamp() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function downloadCsv() {
    downloadBlob(new Blob([Exporter.buildCsv(registry.display())], { type: 'text/csv;charset=utf-8' }), 'tambola_tickets.csv');
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
    renderGallery();
  }

  async function onReset() {
    const choice = await askChoice('Reset registry', 'This permanently removes all ' + registry.ticketCount + ' issued tickets and restarts serial numbers. Export the registry first if you may need it.', [
      { label: 'Reset everything', value: true, danger: true },
      { label: 'Cancel', value: null, primary: true }
    ]);
    if (!choice) return;
    resetRegistry();
    renderGallery();
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
    renderGallery();
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

    $('rulesLink').addEventListener('click', function (e) {
      e.preventDefault();
      $('rules').open = true;
      $('rules').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (window.location.hash === '#rules') $('rules').open = true;

    $('sheetPicker').addEventListener('change', function (e) { loadSheet(e.target.value); });
    $('generateBtn').addEventListener('click', onGenerate);
    $('walkinForm').addEventListener('submit', onWalkin);
    $('downloadAllBtn').addEventListener('click', downloadAll);
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
    $('gallery').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-serial]');
      if (b) downloadOne(Number(b.dataset.serial));
    });

    $('restoreContinue').addEventListener('click', function () {
      pendingRestore = false;
      $('restoreBanner').hidden = true;
      renderGallery();
    });
    $('restoreFresh').addEventListener('click', async function () {
      const choice = await askChoice('Start fresh', 'Discard the ' + registry.ticketCount + ' saved tickets and start over?', [
        { label: 'Discard saved tickets', value: true, danger: true },
        { label: 'Cancel', value: null, primary: true }
      ]);
      if (!choice) return;
      resetRegistry();
      pendingRestore = false;
      $('restoreBanner').hidden = true;
      renderGallery();
    });

    ['heading', 'footerText', 'showSerial', 'showLabel'].forEach(function (id) {
      $(id).addEventListener('input', function () { persistSettings(); redrawAll(); });
    });
    $('titleCase').addEventListener('change', function () { persistSettings(); rebuildPlan(); });
    $('useSeed').addEventListener('change', function () { updateSeedRow(); persistSettings(); });
    $('pngLayout').addEventListener('change', persistSettings);
    $('seed').addEventListener('input', persistSettings);

    window.addEventListener('storage', function (e) {
      if (e.key === REG_KEY && syncFromStorage()) toast('Tickets were updated in another tab; this view was refreshed.');
    });
  }

  init();
})();
