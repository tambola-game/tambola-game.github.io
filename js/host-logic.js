/* Host console logic: number calling (no repeats), nicknames, claim patterns and ticket-ID parsing. No DOM access. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TambolaHost = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX = 90;

  // Classic, office-safe calling nicknames (numbers without one are simply called out).
  const NICKNAMES = {
    1: "Kelly's eye", 2: 'One little duck', 3: 'Cup of tea', 4: 'Knock at the door', 5: 'Man alive', 6: 'Half a dozen',
    7: 'Lucky seven', 8: 'Garden gate', 9: "Doctor's orders", 10: 'Perfect ten', 11: 'Legs eleven', 12: 'One dozen',
    13: 'Unlucky for some', 14: "Valentine's Day", 15: 'Young and keen', 16: 'Sweet sixteen', 17: 'Dancing queen',
    18: 'Coming of age', 19: 'Goodbye teens', 20: 'One score', 21: 'Key of the door', 22: 'Two little ducks',
    23: 'Thee and me', 24: 'Two dozen', 25: 'Duck and dive', 26: 'Pick and mix', 27: 'Gateway to heaven',
    29: 'Rise and shine', 31: 'Get up and run', 32: 'Buckle my shoe', 33: 'All the threes', 34: 'Ask for more',
    35: 'Jump and jive', 36: 'Three dozen', 38: 'Christmas cake', 39: 'Those famous steps', 41: 'Time for fun',
    42: 'Winnie the Pooh', 45: 'Halfway there', 46: 'Up to tricks', 48: 'Four dozen', 50: 'Half a century',
    51: 'Tweak of the thumb', 53: 'Stuck in the tree', 54: 'Clean the floor', 55: 'Snakes alive', 56: 'Was she worth it?',
    57: 'Heinz varieties', 58: 'Make them wait', 59: 'Brighton line', 60: 'Five dozen', 61: "Baker's bun", 62: 'Tickety-boo',
    63: 'Tickle me', 64: 'Red raw', 65: 'Old age pension', 66: 'Clickety-click', 67: 'Made in heaven', 68: 'Saving grace',
    70: 'Three score and ten', 71: 'Bang on the drum', 72: 'Six dozen', 73: 'Queen bee', 74: 'Candy store',
    75: 'Strive and strive', 76: 'Trombones', 77: 'Sunset strip', 78: "Heaven's gate", 79: 'One more time',
    80: 'Eight and blank', 81: 'Stop and run', 82: 'Straight on through', 83: 'Time for tea', 84: 'Seven dozen',
    85: 'Staying alive', 86: 'Between the sticks', 87: 'Torquay in Devon', 88: 'Two fat ladies', 89: 'Nearly there',
    90: 'Top of the shop'
  };

  function nickname(n) { return NICKNAMES[n] || ''; }

  function remaining(calls) {
    const called = new Set(calls);
    const out = [];
    for (let n = 1; n <= MAX; n++) if (!called.has(n)) out.push(n);
    return out;
  }

  // Picks a uniformly random number that has not been called yet; null when all 90 are called.
  function drawNext(calls, rng) {
    const left = remaining(calls);
    if (!left.length) return null;
    return left[Math.floor(rng() * left.length)];
  }

  // A saved call list is only trusted if it is a list of distinct whole numbers in 1..90.
  function validateCalls(calls) {
    if (!Array.isArray(calls) || calls.length > MAX) return false;
    const seen = new Set();
    for (let i = 0; i < calls.length; i++) {
      const n = calls[i];
      if (!Number.isInteger(n) || n < 1 || n > MAX || seen.has(n)) return false;
      seen.add(n);
    }
    return true;
  }

  // The prizes announced to the participants, in the order of the email. `ANY_COUNT` patterns are "any N numbers of the ticket".
  const PATTERNS = [
    { id: 'early5', name: 'Early Five', hint: 'first to mark any 5 numbers' },
    { id: 'lucky7', name: 'Lucky Seven', hint: 'first to mark any 7 numbers' },
    { id: 'row1', name: 'Top Line', hint: 'all numbers in row 1' },
    { id: 'row2', name: 'Middle Line', hint: 'all numbers in row 2' },
    { id: 'row3', name: 'Bottom Line', hint: 'all numbers in row 3' },
    { id: 'corners', name: 'Four Corners', hint: 'the 4 corner numbers: first and last of the top row and of the bottom row' },
    { id: 'star', name: 'Star / Centre', hint: 'the middle number of the ticket: the 3rd of the 5 numbers in the middle row' },
    { id: 'full', name: 'Full House', hint: 'all 15 numbers' },
    { id: 'full2', name: 'Second Full House', hint: 'all 15 numbers on the next ticket to complete after the first' }
  ];
  const ANY_COUNT = { early5: 5, lucky7: 7 };

  const rowNumbers = function (grid, r) { return grid[r].filter(Boolean); };
  const allNumbers = function (grid) { return grid[0].concat(grid[1], grid[2]).filter(Boolean); };

  // Numbers that must be called for a pattern (Early Five and Lucky Seven have no fixed set: they are any N of the ticket's numbers).
  function patternNumbers(grid, id) {
    if (id === 'row1') return rowNumbers(grid, 0);
    if (id === 'row2') return rowNumbers(grid, 1);
    if (id === 'row3') return rowNumbers(grid, 2);
    if (id === 'full' || id === 'full2') return allNumbers(grid);
    if (id === 'star') return [rowNumbers(grid, 1)[2]];
    if (id === 'corners') {
      const top = rowNumbers(grid, 0), bottom = rowNumbers(grid, 2);
      return [top[0], top[top.length - 1], bottom[0], bottom[bottom.length - 1]];
    }
    return null;
  }

  /**
   * Checks a ticket against the calls made so far. For every pattern returns
   * { id, name, hint, needed, marked, complete, completedAt (1-based call number or null), completedBy (the number called then) }.
   */
  function checkTicket(grid, calls) {
    const pos = new Map(calls.map(function (n, i) { return [n, i + 1]; }));
    return PATTERNS.map(function (p) {
      const res = { id: p.id, name: p.name, hint: p.hint, needed: 0, marked: 0, complete: false, completedAt: null, completedBy: null };
      const any = ANY_COUNT[p.id];
      if (any) {
        const hits = allNumbers(grid).filter(function (n) { return pos.has(n); }).map(function (n) { return pos.get(n); }).sort(function (a, b) { return a - b; });
        res.needed = any;
        res.marked = Math.min(any, hits.length);
        res.complete = hits.length >= any;
        if (res.complete) res.completedAt = hits[any - 1];
      } else {
        const nums = patternNumbers(grid, p.id);
        const hits = nums.filter(function (n) { return pos.has(n); });
        res.needed = nums.length;
        res.marked = hits.length;
        res.complete = hits.length === nums.length;
        if (res.complete) res.completedAt = Math.max.apply(null, nums.map(function (n) { return pos.get(n); }));
      }
      if (res.completedAt) res.completedBy = calls[res.completedAt - 1];
      return res;
    });
  }

  // "#0042", "0042" or "42" -> 42; anything else -> null.
  function parseTicketId(text) {
    const m = /^\s*#?\s*0*(\d{1,6})\s*$/.exec(String(text == null ? '' : text));
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n > 0 ? n : null;
  }

  // What the caller says out loud, e.g. "Two and two, 22. Two little ducks".
  function speechText(n) {
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
    const spoken = n < 10 ? 'Number ' + n : String(n).split('').map(function (d) { return words[Number(d)]; }).join(' and ') + ', ' + n;
    return nickname(n) ? spoken + '. ' + nickname(n) : spoken;
  }

  // ---------- verifying a claim from the numbers alone (no ticket needs to be loaded) ----------
  const PATTERN_SIZE = { early5: 5, lucky7: 7, row1: 5, row2: 5, row3: 5, corners: 4, star: 1, full: 15, full2: 15 };
  const patternById = function (id) { return PATTERNS.filter(function (p) { return p.id === id; })[0]; };

  // Pulls the numbers out of whatever was typed or pasted ("4 20, 34/44;50"). Out-of-range tokens and repeats are reported, not used.
  function parseNumbers(text) {
    const tokens = String(text == null ? '' : text).match(/\d+/g) || [];
    const numbers = [], duplicates = [], invalid = [];
    tokens.forEach(function (t) {
      const n = parseInt(t, 10);
      if (!(n >= 1 && n <= MAX)) { invalid.push(t); return; }
      if (numbers.indexOf(n) >= 0) { if (duplicates.indexOf(n) < 0) duplicates.push(n); return; }
      numbers.push(n);
    });
    return { numbers: numbers, duplicates: duplicates, invalid: invalid };
  }

  /**
   * Verifies a claimed pattern from the claimant's numbers against the calls made so far.
   * Returns { status: 'valid' | 'not-called' | 'wrong-count', ok, expected, items: [{ n, called, at }], missing, completedAt, completedBy, message }.
   * "Any N" prizes (Early Five, Lucky Seven): at least N numbers must be given and at least N of them called.
   * Every other pattern needs exactly its size, all called.
   */
  function verifyClaim(patternId, numbers, calls) {
    const p = patternById(patternId);
    const size = PATTERN_SIZE[patternId];
    const pos = new Map(calls.map(function (n, i) { return [n, i + 1]; }));
    const items = numbers.map(function (n) { return { n: n, called: pos.has(n), at: pos.get(n) || null }; });
    const missing = items.filter(function (i) { return !i.called; }).map(function (i) { return i.n; });
    const res = { status: 'valid', ok: false, expected: size, items: items, missing: missing, completedAt: null, completedBy: null, message: '' };
    if (!p) { res.status = 'wrong-count'; res.message = 'Unknown pattern.'; return res; }

    const any = ANY_COUNT[patternId];
    if (any ? numbers.length < size : numbers.length !== size) {
      res.status = 'wrong-count';
      res.message = p.name + (any ? ' needs at least ' : ' needs exactly ') + size + ' number' + (size === 1 ? '' : 's') + ' (' + p.hint + '). You entered ' + numbers.length + '.';
      return res;
    }
    const hits = items.filter(function (i) { return i.called; }).map(function (i) { return i.at; }).sort(function (a, b) { return a - b; });
    const enough = any ? hits.length >= size : missing.length === 0;
    if (!enough) {
      res.status = 'not-called';
      res.message = any
        ? 'Not valid: only ' + hits.length + ' of these numbers have been called (need ' + size + '). Not called: ' + missing.join(', ') + '.'
        : 'Not valid: ' + missing.join(', ') + (missing.length === 1 ? ' has' : ' have') + ' not been called.';
      return res;
    }
    res.ok = true;
    res.completedAt = any ? hits[size - 1] : hits[hits.length - 1];
    res.completedBy = calls[res.completedAt - 1];
    const ago = calls.length - res.completedAt;
    res.message = 'Valid ' + p.name + ': ' + (any ? 'at least ' + size + ' of these' : size === 1 ? 'this' : 'all ' + size) + ' number' + (!any && size === 1 ? ' was' : 's were') + ' called. Completed at call #' + res.completedAt + ' (' + res.completedBy + ')' +
      (ago > 0 ? ', ' + ago + ' call' + (ago === 1 ? '' : 's') + ' ago.' : ', just now.');
    return res;
  }

  /**
   * Looks the claimed numbers up in a saved registry ({ tickets, people }). For rows, corners, star and the full houses the numbers must be
   * exactly that part of the ticket (rows are unique across the registry, so this normally names one ticket; a star number can be on many);
   * for the "any N" prizes they must all be on the ticket.
   * Returns { total, matches: [{ serial, name, index, count }] } (matches limited to `limit`).
   */
  function findTickets(data, patternId, numbers, limit) {
    const out = { total: 0, matches: [] };
    if (!data || !Array.isArray(data.tickets) || !numbers.length) return out;
    const want = new Set(numbers);
    const nameOf = new Map((data.people || []).map(function (p) { return [p.id, p.name]; }));
    const perPerson = new Map();
    data.tickets.forEach(function (t) { (perPerson.get(t.personId) || perPerson.set(t.personId, []).get(t.personId)).push(t.serial); });
    data.tickets.forEach(function (t) {
      const own = allNumbers(t.grid);
      let hit;
      if (ANY_COUNT[patternId]) {
        const set = new Set(own);
        hit = numbers.every(function (n) { return set.has(n); });
      } else {
        const need = patternNumbers(t.grid, patternId);
        hit = need && need.length === want.size && need.every(function (n) { return want.has(n); });
      }
      if (!hit) return;
      out.total++;
      if (out.matches.length < (limit || 5)) {
        const serials = perPerson.get(t.personId).slice().sort(function (a, b) { return a - b; });
        out.matches.push({ serial: t.serial, name: nameOf.get(t.personId) || '(unknown)', index: serials.indexOf(t.serial) + 1, count: serials.length });
      }
    });
    return out;
  }

  return {
    MAX, NICKNAMES, PATTERNS, PATTERN_SIZE, ANY_COUNT, nickname, remaining, drawNext, validateCalls, patternNumbers, checkTicket, parseTicketId, speechText,
    parseNumbers, verifyClaim, findTickets
  };
});
