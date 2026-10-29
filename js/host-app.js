(function () {
  'use strict';

  const H = window.TambolaHost;
  const Rng = window.TambolaRng;
  const Reg = window.TambolaRegistry;

  const GAME_KEY = 'tambola.host.v1';
  const REG_KEY = 'tambola.registry.v1';
  const $ = function (id) { return document.getElementById(id); };
  const rng = Rng.cryptoRng();

  let calls = [];            // numbers called so far, in order
  let prizes = {};           // patternId -> { name, ticket }
  let importedData = null;   // registry loaded from a file (used only by this page)
  let autoTimer = null;
  let toastTimer = null;
  const cells = [];          // board cells, index n-1

  // ---------- persistence (a refresh must never lose the game) ----------
  function save() {
    try {
      window.localStorage.setItem(GAME_KEY, JSON.stringify({ calls: calls, prizes: prizes, secs: Number($('autoSecs').value) || 15, speak: $('speakChk').checked }));
    } catch (e) { /* storage unavailable: the game keeps working in memory */ }
  }
  function load() {
    try {
      const s = JSON.parse(window.localStorage.getItem(GAME_KEY) || 'null');
      if (!s) return;
      if (H.validateCalls(s.calls)) calls = s.calls;
      if (s.prizes && typeof s.prizes === 'object') prizes = s.prizes;
      if (s.secs >= 5 && s.secs <= 60) $('autoSecs').value = s.secs;
      $('speakChk').checked = !!s.speak;
    } catch (e) { /* ignore a corrupt saved game */ }
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4500);
  }

  function askChoice(title, message, choices) {
    return new Promise(function (resolve) {
      const dlg = $('dlg');
      $('dlgTitle').textContent = title;
      $('dlgMessage').textContent = message;
      const wrap = $('dlgButtons');
      wrap.textContent = '';
      let settled = false;
      const finish = function (v) {
        if (settled) return;
        settled = true;
        dlg.removeEventListener('cancel', dismiss);
        dlg.removeEventListener('close', dismiss);
        resolve(v);
      };
      const dismiss = function () { finish(null); };
      choices.forEach(function (c) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn' + (c.primary ? ' btn-primary' : '') + (c.danger ? ' btn-danger' : '');
        b.textContent = c.label;
        b.addEventListener('click', function () { finish(c.value); if (dlg.open) dlg.close(); });
        wrap.appendChild(b);
      });
      dlg.addEventListener('cancel', dismiss);
      dlg.addEventListener('close', dismiss);
      dlg.showModal();
    });
  }

  // ---------- board and caller ----------
  function buildBoard() {
    const board = $('board');
    for (let n = 1; n <= H.MAX; n++) {
      const c = document.createElement('div');
      c.className = 'cell';
      c.textContent = String(n);
      c.setAttribute('role', 'gridcell');
      board.appendChild(c);
      cells.push(c);
    }
  }

  function render(animate) {
    const last = calls.length ? calls[calls.length - 1] : null;
    const position = new Map(calls.map(function (n, i) { return [n, i]; }));
    const firstRecent = calls.length - 6; // the five calls before the current one
    cells.forEach(function (c, i) {
      const n = i + 1;
      const at = position.has(n) ? position.get(n) : -1;
      const tier = at < 0 ? '' : n === last ? 'last' : at >= firstRecent ? 'recent' : 'old';
      c.classList.toggle('last', tier === 'last');
      c.classList.toggle('recent', tier === 'recent');
      c.classList.toggle('called', tier === 'old');
      c.setAttribute('aria-label', n + (tier === 'last' ? ' current number' : tier === 'recent' ? ' called recently' : tier === 'old' ? ' called' : ' not called'));
    });
    const num = $('curNum');
    num.textContent = last === null ? '—' : String(last);
    if (animate) { num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); }
    $('curNick').textContent = last === null ? 'Press “Call next number” (or Space) to start' : (H.nickname(last) || ' ');
    const chips = $('lastChips');
    chips.textContent = '';
    calls.slice(-6, -1).reverse().forEach(function (n, i) {
      const s = document.createElement('span');
      s.className = 'chip' + (i > 1 ? ' old' : '');
      s.textContent = String(n);
      chips.appendChild(s);
    });
    const left = H.MAX - calls.length;
    $('counter').textContent = calls.length + ' called · ' + left + ' left';
    $('nextBtn').disabled = left === 0;
    $('undoBtn').disabled = calls.length === 0;
    $('copyBtn').disabled = calls.length === 0;
    if (left === 0) stopAuto();
    renderPrizes();
  }

  function say(n) {
    if (!$('speakChk').checked || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(H.speechText(n));
      u.lang = 'en-IN';
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch (e) { /* speech is optional */ }
  }

  function callNext() {
    const n = H.drawNext(calls, rng);
    if (n === null) { toast('All 90 numbers have been called. Time for the group photo!'); return; }
    calls.push(n);
    save();
    render(true);
    say(n);
  }

  function undo() {
    if (!calls.length) return;
    const n = calls.pop();
    save();
    render(false);
    toast('Took back ' + n + '. It is back in the pool.');
  }

  // ---------- auto-call ----------
  function startAuto() {
    const secs = Math.min(60, Math.max(5, Number($('autoSecs').value) || 15));
    $('autoSecs').value = secs;
    stopAuto();
    autoTimer = setInterval(callNext, secs * 1000);
    $('autoBtn').setAttribute('aria-pressed', 'true');
    $('autoBtn').textContent = '⏸ Pause auto-call';
    save();
  }
  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    $('autoBtn').setAttribute('aria-pressed', 'false');
    $('autoBtn').textContent = '▶ Auto-call';
  }

  // ---------- claim checker: by numbers (default) ----------
  let numClaim = null; // { patternId, verdict, match } of the last numbers check

  function setMode(byNumbers) {
    $('numsMode').hidden = !byNumbers;
    $('idMode').hidden = byNumbers;
    $('modeNums').setAttribute('aria-pressed', String(byNumbers));
    $('modeId').setAttribute('aria-pressed', String(!byNumbers));
  }

  function updateHint() {
    const p = H.PATTERNS.filter(function (x) { return x.id === $('claimPattern').value; })[0];
    const size = H.PATTERN_SIZE[p.id];
    const what = H.ANY_COUNT[p.id] ? 'the ' + size + ' (or more) numbers marked' : size === 1 ? 'the number' : 'the ' + size + ' numbers';
    $('numHint').textContent = p.name + ': enter ' + what + ' — ' + p.hint + '.';
  }

  function matchLabel(match) {
    return Reg.formatSerial(match.serial) + ' — ' + match.name + (match.count > 1 ? ' (ticket ' + match.index + ' of ' + match.count + ')' : '');
  }

  function onNumbers(ev) {
    ev.preventDefault();
    const patternId = $('claimPattern').value;
    const parsed = H.parseNumbers($('claimNums').value);
    if (autoTimer) { stopAuto(); toast('Auto-call paused while you verify.'); }

    const verdict = H.verifyClaim(patternId, parsed.numbers, calls);
    $('numResult').hidden = false;
    $('numHint').hidden = true; // not needed once a result is showing; saves a line so everything fits on one screen
    const box = $('verdict');
    box.className = 'verdict ' + (verdict.ok ? 'ok' : verdict.status === 'wrong-count' ? 'warn' : 'bad');
    const notes = [];
    if (parsed.invalid.length) notes.push('Ignored (not 1–90): ' + parsed.invalid.join(', ') + '.');
    if (parsed.duplicates.length) notes.push('Repeated: ' + parsed.duplicates.join(', ') + '.');
    box.textContent = (verdict.ok ? '✔ ' : verdict.status === 'wrong-count' ? '⚠ ' : '✘ ') + (parsed.numbers.length ? verdict.message : 'Type the numbers from the ticket first.') + (notes.length ? ' ' + notes.join(' ') : '');

    const chips = $('numChips');
    chips.textContent = '';
    verdict.items.forEach(function (it) {
      const c = document.createElement('span');
      c.className = 'num-chip ' + (it.called ? 'yes' : 'no');
      c.textContent = String(it.n);
      c.title = it.called ? 'called at call #' + it.at : 'not called';
      const s = document.createElement('small');
      s.textContent = it.called ? '#' + it.at : '✘';
      c.appendChild(s);
      chips.appendChild(c);
    });

    // Optional: if the tickets are available, say whose ticket these numbers are.
    let match = null;
    const matchEl = $('numMatch');
    matchEl.textContent = '';
    const data = registryData();
    if (parsed.numbers.length && data && Array.isArray(data.tickets)) {
      const found = H.findTickets(data, patternId, parsed.numbers, 3);
      if (found.total === 1) {
        match = found.matches[0];
        matchEl.textContent = 'These numbers are on ' + matchLabel(match) + '.';
      } else if (found.total > 1) {
        matchEl.textContent = 'These numbers are on ' + found.total + ' tickets, e.g. ' + found.matches.map(matchLabel).join('; ') + (found.total > found.matches.length ? '…' : '') + '.';
      } else if (verdict.status !== 'wrong-count') {
        matchEl.textContent = 'No ticket in the loaded registry has exactly these numbers. Ask for a snapshot of the ticket.';
      }
    } else if (parsed.numbers.length) {
      matchEl.textContent = 'Ticket registry not loaded: this checks the numbers were called, not whose ticket it is.';
    }

    // Second Full House must be a different ticket from the one that won Full House.
    let blocked = false;
    if (patternId === 'full2' && verdict.ok) {
      if (!prizes.full) {
        matchEl.textContent += ' Tip: record the Full House winner first, so this can be checked against it.';
      } else if (match && prizes.full.ticket && prizes.full.ticket === Reg.formatSerial(match.serial)) {
        box.className = 'verdict warn';
        box.textContent = '⚠ This is the same ticket that won Full House (' + prizes.full.ticket + '). Second Full House needs a different ticket.';
        blocked = true;
      }
    }

    numClaim = { patternId: patternId, verdict: verdict, match: match };
    $('recordRow').hidden = !verdict.ok || blocked;
    $('winnerName').value = match ? match.name : '';
  }

  function recordNumbersWinner() {
    if (!numClaim || !numClaim.verdict.ok) return;
    const name = $('winnerName').value.trim();
    if (!name) { toast('Type the winner’s name first.'); $('winnerName').focus(); return; }
    const p = H.PATTERNS.filter(function (x) { return x.id === numClaim.patternId; })[0];
    prizes[p.id] = { name: name, ticket: numClaim.match ? Reg.formatSerial(numClaim.match.serial) : '' };
    save();
    renderPrizes();
    toast(p.name + ': ' + name + ' recorded.');
  }

  // ---------- claim checker: by ticket ID ----------
  function registryData() {
    if (importedData) return importedData;
    try { return JSON.parse(window.localStorage.getItem(REG_KEY) || 'null'); } catch (e) { return null; }
  }

  function updateRegSummary() {
    const d = registryData();
    $('regSummary').textContent = d && Array.isArray(d.tickets)
      ? 'Ticket registry: ' + d.tickets.length + ' tickets' + (importedData ? ' (loaded from file)' : '')
      : 'Ticket registry: none found — load the registry file';
  }

  function renderClaim(ticket, person, data) {
    const mine = data.tickets.filter(function (t) { return t.personId === ticket.personId; }).sort(function (a, b) { return a.serial - b.serial; });
    const idx = mine.findIndex(function (t) { return t.serial === ticket.serial; }) + 1;
    $('claimWho').textContent = Reg.formatSerial(ticket.serial) + ' — ' + person.name + (mine.length > 1 ? '  (ticket ' + idx + ' of ' + mine.length + ')' : '');

    const calledSet = new Set(calls);
    const grid = $('claimGrid');
    grid.textContent = '';
    ticket.grid.forEach(function (row) {
      const tr = document.createElement('tr');
      row.forEach(function (v) {
        const td = document.createElement('td');
        if (v) { td.textContent = String(v); td.className = 'num' + (calledSet.has(v) ? ' hit' : ''); }
        tr.appendChild(td);
      });
      grid.appendChild(tr);
    });

    const list = $('claimPatterns');
    list.textContent = '';
    H.checkTicket(ticket.grid, calls).forEach(function (p) {
      const li = document.createElement('li');
      li.className = p.complete ? 'ok' : '';
      const head = document.createElement('div');
      head.className = 'ph';
      const nm = document.createElement('span');
      nm.className = 'pname';
      nm.textContent = (p.complete ? '✔ ' : '') + p.name;
      head.appendChild(nm);
      const st = document.createElement('span');
      st.className = 'pstat';
      if (p.complete) {
        const ago = calls.length - p.completedAt;
        st.textContent = 'at #' + p.completedAt + ' (' + p.completedBy + ') · ' + (ago > 0 ? ago + ' ago' : 'just now');
        st.title = 'Completed at call #' + p.completedAt + ' (number ' + p.completedBy + ')';
      } else {
        st.textContent = p.marked + ' of ' + p.needed + ' marked';
      }
      if (p.complete) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-small';
        b.textContent = prizes[p.id] ? 'Replace' : 'Record';
        b.title = (prizes[p.id] ? 'Replace the recorded winner of ' : 'Record the winner of ') + p.name;
        b.addEventListener('click', function () {
          prizes[p.id] = { name: person.name, ticket: Reg.formatSerial(ticket.serial) };
          save();
          renderPrizes();
          renderClaim(ticket, person, data);
          toast(p.name + ': ' + person.name + ' recorded.');
        });
        head.appendChild(b);
      }
      li.append(head, st);
      list.appendChild(li);
    });
    $('claimResult').hidden = false;
  }

  function onClaim(ev) {
    ev.preventDefault();
    const msg = $('claimMsg');
    $('claimResult').hidden = true;
    const serial = H.parseTicketId($('claimId').value);
    if (serial === null) { msg.textContent = 'Type a ticket ID such as #0042.'; return; }
    const data = registryData();
    if (!data || !Array.isArray(data.tickets)) { msg.textContent = 'No ticket registry found in this browser. Open the registry section below and load the file.'; return; }
    const ticket = data.tickets.find(function (t) { return t.serial === serial; });
    if (!ticket) { msg.textContent = 'Ticket ' + Reg.formatSerial(serial) + ' was not found.'; return; }
    const person = (data.people || []).find(function (p) { return p.id === ticket.personId; }) || { name: '(unknown)' };
    if (autoTimer) { stopAuto(); toast('Auto-call paused while you verify.'); }
    msg.textContent = '';
    renderClaim(ticket, person, data);
  }

  // ---------- prizes ----------
  function renderPrizes() {
    const ul = $('prizeList');
    ul.textContent = '';
    H.PATTERNS.forEach(function (p) {
      const li = document.createElement('li');
      const won = prizes[p.id];
      li.className = won ? 'won' : '';
      const nm = document.createElement('span');
      nm.className = 'pname';
      nm.textContent = p.name;
      nm.title = p.hint;
      const w = document.createElement('span');
      w.className = 'pwinner';
      w.textContent = won ? '🏆 ' + won.name + (won.ticket ? ' · ' + won.ticket : '') : 'open';
      li.append(nm, w);
      if (won) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-small';
        b.textContent = 'Clear';
        b.addEventListener('click', function () { delete prizes[p.id]; save(); renderPrizes(); });
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
  }

  // ---------- misc actions ----------
  async function newGame() {
    const choice = await askChoice('Start a new game?', 'This clears the ' + calls.length + ' numbers called and the recorded winners.', [
      { label: 'Start new game', value: true, danger: true },
      { label: 'Keep playing', value: null, primary: true }
    ]);
    if (!choice) return;
    stopAuto();
    calls = [];
    prizes = {};
    $('claimResult').hidden = true;
    $('claimMsg').textContent = '';
    save();
    render(false);
    toast('New game started. Good luck!');
  }

  async function copyCalled() {
    const text = calls.join(', ');
    try { await navigator.clipboard.writeText(text); toast('Copied ' + calls.length + ' called numbers.'); }
    catch (e) { toast('Could not copy automatically: ' + text); }
  }

  function togglePresenter() {
    const on = !document.body.classList.contains('presenter');
    document.body.classList.toggle('presenter', on);
    $('presenterBtn').setAttribute('aria-pressed', String(on));
    $('presenterBtn').textContent = on ? 'Host view' : 'Presenter view';
  }

  async function importRegistry(file) {
    try {
      const data = JSON.parse(await file.text());
      const v = Reg.Registry.validateData(data);
      if (!v.ok) throw new Error(v.errors[0] || 'invalid');
      importedData = data;
      toast('Loaded ' + data.tickets.length + ' tickets from ' + file.name + '.');
    } catch (e) {
      toast('That file is not a valid registry export.');
    }
    updateRegSummary();
  }

  function init() {
    buildBoard();
    load();
    renderPrizes();
    render(false);
    updateRegSummary();

    $('nextBtn').addEventListener('click', callNext);
    $('undoBtn').addEventListener('click', undo);
    $('autoBtn').addEventListener('click', function () { if (autoTimer) stopAuto(); else startAuto(); });
    $('autoSecs').addEventListener('change', function () { save(); if (autoTimer) startAuto(); });
    $('speakChk').addEventListener('change', save);
    $('copyBtn').addEventListener('click', copyCalled);
    $('resetBtn').addEventListener('click', newGame);
    $('presenterBtn').addEventListener('click', togglePresenter);
    $('claimForm').addEventListener('submit', onClaim);
    $('numForm').addEventListener('submit', onNumbers);
    $('recordBtn').addEventListener('click', recordNumbersWinner);
    $('winnerName').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); recordNumbersWinner(); } });
    $('modeNums').addEventListener('click', function () { setMode(true); });
    $('modeId').addEventListener('click', function () { setMode(false); });
    H.PATTERNS.forEach(function (p) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; $('claimPattern').appendChild(o); });
    $('claimPattern').addEventListener('change', function () { updateHint(); $('numHint').hidden = false; $('numResult').hidden = true; });
    updateHint();
    $('regFile').addEventListener('change', function (e) { if (e.target.files[0]) importRegistry(e.target.files[0]); e.target.value = ''; });
    window.addEventListener('storage', function (e) { if (e.key === REG_KEY) updateRegSummary(); });

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input, textarea, select, button, a, dialog')) return;
      if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); callNext(); }
      else if (e.key === 'p' || e.key === 'P') togglePresenter();
    });
  }

  init();
})();
