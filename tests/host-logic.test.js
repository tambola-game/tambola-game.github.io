const test = require('node:test');
const assert = require('node:assert');
const H = require('../js/host-logic.js');
const Rng = require('../js/rng.js');
const T = require('../js/ticket.js');
const { Registry } = require('../js/registry.js');

const SAMPLE = [[4, 0, 20, 34, 44, 50, 0, 0, 0], [5, 16, 0, 0, 0, 53, 64, 75, 0], [8, 0, 24, 0, 0, 58, 0, 79, 88]];
const byId = (res) => Object.fromEntries(res.map((r) => [r.id, r]));

test('nicknames: only for 1..90, non-empty, no crude ones, and nickname() falls back to empty', () => {
  Object.entries(H.NICKNAMES).forEach(([n, name]) => {
    assert.ok(n >= 1 && n <= 90 && name.length > 1, n);
    assert.ok(!/dirty|droopy|naughty|knees/i.test(name), name);
  });
  assert.strictEqual(H.nickname(22), 'Two little ducks');
  assert.strictEqual(H.nickname(88), 'Two fat ladies');
  assert.strictEqual(H.nickname(90), 'Top of the shop');
  assert.strictEqual(H.nickname(69), '');
  assert.ok(Object.keys(H.NICKNAMES).length >= 70);
});

test('drawNext: 90 draws give every number exactly once, then null', () => {
  const rng = Rng.cryptoRng();
  const calls = [];
  for (let i = 0; i < 90; i++) {
    const n = H.drawNext(calls, rng);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 90);
    assert.ok(!calls.includes(n), 'repeated ' + n);
    calls.push(n);
  }
  assert.deepStrictEqual(calls.slice().sort((a, b) => a - b), Array.from({ length: 90 }, (_, i) => i + 1));
  assert.strictEqual(H.drawNext(calls, rng), null);
});

test('drawNext is uniform over what is left (statistical check) and reproducible with a seeded rng', () => {
  const counts = new Array(91).fill(0);
  const rng = Rng.seededRng('host');
  for (let i = 0; i < 90000; i++) counts[H.drawNext([], rng)]++;
  for (let n = 1; n <= 90; n++) assert.ok(counts[n] > 800 && counts[n] < 1200, n + ': ' + counts[n]);
  const a = [], b = [];
  const r1 = Rng.seededRng('same'), r2 = Rng.seededRng('same');
  for (let i = 0; i < 20; i++) { a.push(H.drawNext(a, r1)); b.push(H.drawNext(b, r2)); }
  assert.deepStrictEqual(a, b);
});

test('undo semantics: a popped number becomes drawable again', () => {
  const calls = [5, 17, 33];
  calls.pop();
  assert.ok(H.remaining(calls).includes(33));
  assert.strictEqual(H.remaining(calls).length, 88);
});

test('validateCalls accepts only distinct whole numbers in 1..90', () => {
  assert.ok(H.validateCalls([]));
  assert.ok(H.validateCalls([1, 90, 45]));
  assert.ok(!H.validateCalls([1, 1]));
  assert.ok(!H.validateCalls([0]));
  assert.ok(!H.validateCalls([91]));
  assert.ok(!H.validateCalls([1.5]));
  assert.ok(!H.validateCalls('12'));
  assert.ok(!H.validateCalls(Array.from({ length: 91 }, (_, i) => i + 1)));
});

test('parseTicketId handles #0042, 0042, 42 and rejects junk', () => {
  assert.strictEqual(H.parseTicketId('#0042'), 42);
  assert.strictEqual(H.parseTicketId(' 0042 '), 42);
  assert.strictEqual(H.parseTicketId('42'), 42);
  assert.strictEqual(H.parseTicketId('# 7'), 7);
  ['', 'abc', '#', '0', '#0000', '4x2', '-3', null, undefined, '1234567'].forEach((x) => assert.strictEqual(H.parseTicketId(x), null, String(x)));
});

test('patternNumbers: rows, corners (first/last of top and bottom rows) and full house', () => {
  assert.deepStrictEqual(H.patternNumbers(SAMPLE, 'row1'), [4, 20, 34, 44, 50]);
  assert.deepStrictEqual(H.patternNumbers(SAMPLE, 'row2'), [5, 16, 53, 64, 75]);
  assert.deepStrictEqual(H.patternNumbers(SAMPLE, 'row3'), [8, 24, 58, 79, 88]);
  assert.deepStrictEqual(H.patternNumbers(SAMPLE, 'corners'), [4, 50, 8, 88]);
  assert.strictEqual(H.patternNumbers(SAMPLE, 'full').length, 15);
  assert.strictEqual(H.patternNumbers(SAMPLE, 'early5'), null);
});

test('checkTicket: progress, completion call numbers and who completed it', () => {
  // 9 is not on the ticket, so it takes call #3 without marking anything. Row 1 = 4,20,34,44,50; 8 and 88 are bottom corners.
  const calls = [34, 4, 9, 50, 20, 44, 88, 8];
  const r = byId(H.checkTicket(SAMPLE, calls));
  assert.strictEqual(r.row1.complete, true);
  assert.strictEqual(r.row1.completedAt, 6);
  assert.strictEqual(r.row1.completedBy, 44);
  assert.strictEqual(r.early5.complete, true);
  assert.strictEqual(r.early5.completedAt, 6, 'five ticket numbers (34, 4, 50, 20, 44) are in by call #6: ' + JSON.stringify(r.early5));
  assert.strictEqual(r.early5.completedBy, 44);
  assert.strictEqual(r.corners.complete, true);
  assert.strictEqual(r.corners.completedAt, 8);
  assert.strictEqual(r.corners.completedBy, 8);
  assert.strictEqual(r.row2.complete, false);
  assert.strictEqual(r.row2.marked, 0);
  assert.strictEqual(r.row3.marked, 2);
  assert.strictEqual(r.full.complete, false);
  assert.strictEqual(r.full.completedAt, null);
});

test('checkTicket: Early Five needs five numbers; four is not enough', () => {
  const four = byId(H.checkTicket(SAMPLE, [4, 20, 34, 44]));
  assert.strictEqual(four.early5.complete, false);
  assert.strictEqual(four.early5.marked, 4);
  assert.strictEqual(four.early5.needed, 5);
  const five = byId(H.checkTicket(SAMPLE, [4, 20, 34, 44, 9, 5]));
  assert.strictEqual(five.early5.complete, true);
});

test('checkTicket: Full House when all 15 are called; completedAt is the last of them', () => {
  const nums = T.allNumbers(SAMPLE);
  const calls = [1, 2, 3].concat(nums.slice(0, 14), [90 === nums[14] ? 89 : 90], [nums[14]]);
  const r = byId(H.checkTicket(SAMPLE, calls));
  assert.strictEqual(r.full.complete, true);
  assert.strictEqual(r.full.completedAt, calls.length);
  assert.strictEqual(r.full.completedBy, nums[14]);
});

test('property: on real generated tickets completion calls obey Early5 <= rows/corners <= Full House', () => {
  const rng = Rng.seededRng('prop');
  for (let t = 0; t < 300; t++) {
    const grid = T.generateTicket(rng);
    const calls = [];
    while (true) { const n = H.drawNext(calls, rng); if (n === null) break; calls.push(n); }
    const r = byId(H.checkTicket(grid, calls));
    Object.values(r).forEach((p) => assert.ok(p.complete && p.completedAt >= 1 && p.completedAt <= 90));
    ['row1', 'row2', 'row3', 'corners'].forEach((id) => {
      assert.ok(r.early5.completedAt <= r[id].completedAt, id);
      assert.ok(r[id].completedAt <= r.full.completedAt, id);
    });
    assert.strictEqual(r.full.completedAt, Math.max(r.row1.completedAt, r.row2.completedAt, r.row3.completedAt));
    assert.strictEqual(calls[r.full.completedAt - 1] > 0, true);
  }
});

test('speechText reads digits then the number, plus the nickname', () => {
  assert.strictEqual(H.speechText(22), 'two and two, 22. Two little ducks');
  assert.strictEqual(H.speechText(7), 'Number 7. Lucky seven');
  assert.strictEqual(H.speechText(69), 'six and nine, 69');
  assert.strictEqual(H.speechText(90), 'nine and zero, 90. Top of the shop');
});

// ---------- verifying a claim from the numbers alone ----------
test('parseNumbers: any separators, repeats and out-of-range tokens are reported, never used', () => {
  assert.deepStrictEqual(H.parseNumbers('4 20, 34/44;50'), { numbers: [4, 20, 34, 44, 50], duplicates: [], invalid: [] });
  assert.deepStrictEqual(H.parseNumbers('04  7\n9'), { numbers: [4, 7, 9], duplicates: [], invalid: [] });
  assert.deepStrictEqual(H.parseNumbers('5 5 12 5'), { numbers: [5, 12], duplicates: [5], invalid: [] });
  assert.deepStrictEqual(H.parseNumbers('0 91 100 7'), { numbers: [7], duplicates: [], invalid: ['0', '91', '100'] });
  assert.deepStrictEqual(H.parseNumbers(''), { numbers: [], duplicates: [], invalid: [] });
  assert.deepStrictEqual(H.parseNumbers(null), { numbers: [], duplicates: [], invalid: [] });
  assert.deepStrictEqual(H.parseNumbers('abc'), { numbers: [], duplicates: [], invalid: [] });
});

test('verifyClaim: a first row whose five numbers were all called is valid and says when it was completed', () => {
  const calls = [34, 4, 9, 50, 20, 44, 88, 8];
  const v = H.verifyClaim('row1', [4, 20, 34, 44, 50], calls);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(v.status, 'valid');
  assert.strictEqual(v.completedAt, 6);
  assert.strictEqual(v.completedBy, 44);
  assert.deepStrictEqual(v.items.map((i) => i.at), [2, 5, 1, 6, 4]);
  assert.match(v.message, /Valid Top Line/);
  assert.match(v.message, /call #6 \(44\), 2 calls ago/);
});

test('verifyClaim: reports exactly which numbers have not been called', () => {
  const v = H.verifyClaim('row1', [4, 20, 34, 44, 51], [34, 4, 20, 44]);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.status, 'not-called');
  assert.deepStrictEqual(v.missing, [51]);
  assert.match(v.message, /51 has not been called/);
  const two = H.verifyClaim('row2', [5, 16, 53, 64, 75], [5, 16]);
  assert.deepStrictEqual(two.missing, [53, 64, 75]);
  assert.match(two.message, /53, 64, 75 have not been called/);
});

test('verifyClaim: the number of numbers must match the pattern', () => {
  const calls = Array.from({ length: 90 }, (_, i) => i + 1);
  [['row1', 4], ['row3', 6], ['corners', 5], ['corners', 3], ['full', 14], ['full', 16]].forEach(([id, n]) => {
    const v = H.verifyClaim(id, Array.from({ length: n }, (_, i) => i + 1), calls);
    assert.strictEqual(v.status, 'wrong-count', id + ' ' + n);
    assert.strictEqual(v.ok, false);
    assert.match(v.message, new RegExp('You entered ' + n));
  });
  assert.strictEqual(H.verifyClaim('corners', [4, 50, 8, 88], calls).ok, true);
  assert.strictEqual(H.verifyClaim('full', Array.from({ length: 15 }, (_, i) => i + 1), calls).ok, true);
});

test('verifyClaim: Early Five needs at least 5 numbers and at least 5 of them called', () => {
  const calls = [10, 20, 30, 40, 50, 60];
  assert.strictEqual(H.verifyClaim('early5', [10, 20, 30, 40], calls).status, 'wrong-count');
  const ok = H.verifyClaim('early5', [10, 20, 30, 40, 50], calls);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.completedAt, 5);
  const six = H.verifyClaim('early5', [10, 20, 30, 40, 50, 99 % 90], calls);
  assert.strictEqual(six.ok, true, 'five of the six numbers are called');
  assert.strictEqual(six.completedAt, 5);
  const bad = H.verifyClaim('early5', [10, 20, 30, 40, 55], calls);
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.status, 'not-called');
  assert.match(bad.message, /only 4 of these/);
});

test('verifyClaim: the call position counts every call, including numbers that were not on the ticket', () => {
  const v = H.verifyClaim('corners', [4, 50, 8, 88], [1, 2, 3, 4, 50, 8, 7, 88]);
  assert.strictEqual(v.completedAt, 8);
  assert.strictEqual(v.completedBy, 88);
  assert.match(v.message, /just now/);
});

test('verifyClaim agrees with checkTicket on real tickets (property)', () => {
  const rng = Rng.seededRng('claims');
  for (let t = 0; t < 150; t++) {
    const grid = T.generateTicket(rng);
    const calls = [];
    const stop = 5 + Math.floor(rng() * 80);
    for (let i = 0; i < stop; i++) calls.push(H.drawNext(calls, rng));
    H.checkTicket(grid, calls).forEach((c) => {
      if (H.ANY_COUNT[c.id]) return;
      const v = H.verifyClaim(c.id, H.patternNumbers(grid, c.id), calls);
      assert.strictEqual(v.ok, c.complete, c.id);
      assert.strictEqual(v.completedAt, c.completedAt, c.id);
    });
  }
});

test('findTickets: names the ticket from a row, from corners, from a full house, and for early five', () => {
  const reg = new Registry();
  const rng = Rng.seededRng('find');
  const a = reg.ensurePerson('n:a', 'a', 'Asha'), b = reg.ensurePerson('n:b', 'b', 'Bala');
  reg.issue(a.id, 'excel', rng); reg.issue(a.id, 'excel', rng); reg.issue(b.id, 'excel', rng);
  const data = JSON.parse(JSON.stringify(reg.toJSON()));
  const t2 = data.tickets[1];
  const row = t2.grid[1].filter(Boolean);
  const f = H.findTickets(data, 'row2', row);
  assert.strictEqual(f.total, 1);
  assert.deepStrictEqual(f.matches[0], { serial: t2.serial, name: 'Asha', index: 2, count: 2 });
  assert.strictEqual(H.findTickets(data, 'row1', row).total, 0, 'the same numbers are not that ticket\'s first row');
  assert.strictEqual(H.findTickets(data, 'corners', H.patternNumbers(t2.grid, 'corners')).matches[0].serial, t2.serial);
  assert.strictEqual(H.findTickets(data, 'full', T.allNumbers(t2.grid)).matches[0].name, 'Asha');
  assert.strictEqual(H.findTickets(data, 'early5', T.allNumbers(t2.grid).slice(0, 5)).matches.some((m) => m.serial === t2.serial), true);
  assert.strictEqual(H.findTickets(data, 'row1', [1, 2, 3, 4, 5]).total, 0);
  assert.deepStrictEqual(H.findTickets(null, 'row1', [1]), { total: 0, matches: [] });
  assert.deepStrictEqual(H.findTickets(data, 'row1', []), { total: 0, matches: [] });
});

test('findTickets limits the matches it returns but still counts them all', () => {
  const grid = [[1, 0, 20, 30, 40, 50, 0, 0, 0], [2, 0, 21, 0, 41, 0, 61, 71, 0], [3, 11, 0, 31, 0, 0, 62, 0, 81]];
  const data = { people: [{ id: 1, name: 'P' }], tickets: Array.from({ length: 9 }, (_, i) => ({ serial: i + 1, personId: 1, grid })) };
  const f = H.findTickets(data, 'row1', [1, 20, 30, 40, 50], 3);
  assert.strictEqual(f.total, 9);
  assert.strictEqual(f.matches.length, 3);
});

// ---------- the prizes announced to the participants ----------
test('the prize list matches the participants\' email, in its order', () => {
  assert.deepStrictEqual(H.PATTERNS.map((p) => p.name), ['Early Five', 'Lucky Seven', 'Top Line', 'Middle Line', 'Bottom Line', 'Four Corners', 'Star / Centre', 'Full House', 'Second Full House']);
  assert.deepStrictEqual(H.PATTERNS.map((p) => p.id), ['early5', 'lucky7', 'row1', 'row2', 'row3', 'corners', 'star', 'full', 'full2']);
  assert.deepStrictEqual(Object.keys(H.PATTERN_SIZE).sort(), H.PATTERNS.map((p) => p.id).sort());
  assert.deepStrictEqual(H.PATTERN_SIZE, { early5: 5, lucky7: 7, row1: 5, row2: 5, row3: 5, corners: 4, star: 1, full: 15, full2: 15 });
});

test('Star / Centre is the 3rd of the 5 numbers in the middle row; Second Full House covers all 15', () => {
  assert.deepStrictEqual(H.patternNumbers(SAMPLE, 'star'), [53]);
  assert.deepStrictEqual(H.patternNumbers(SAMPLE, 'full2').slice().sort((a, b) => a - b), T.allNumbers(SAMPLE));
  const rng = Rng.seededRng('star');
  for (let i = 0; i < 200; i++) {
    const g = T.generateTicket(rng);
    const mid = g[1].filter(Boolean);
    assert.strictEqual(mid.length, 5);
    assert.deepStrictEqual(H.patternNumbers(g, 'star'), [mid[2]]);
  }
});

test('Lucky Seven: at least 7 numbers given and at least 7 of them called', () => {
  const calls = [10, 20, 30, 40, 50, 60, 70, 80];
  assert.strictEqual(H.verifyClaim('lucky7', [10, 20, 30, 40, 50, 60], calls).status, 'wrong-count');
  const few = H.verifyClaim('lucky7', [10, 20, 30, 40, 50, 1, 2], calls);
  assert.strictEqual(few.status, 'not-called');
  assert.match(few.message, /only 5 of these numbers have been called \(need 7\)/);
  const ok = H.verifyClaim('lucky7', [10, 20, 30, 40, 50, 60, 70], calls);
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.completedAt, 7);
  assert.match(ok.message, /Valid Lucky Seven: at least 7 of these numbers were called\. Completed at call #7 \(70\), 1 call ago/);
  assert.strictEqual(H.verifyClaim('lucky7', [10, 20, 30, 40, 50, 60, 70, 99 % 90], calls).completedAt, 7, 'extra numbers do not matter');
  // the same seven numbers are NOT enough for a claim that only 5 had been called by then
  assert.strictEqual(H.verifyClaim('lucky7', [10, 20, 30, 40, 50, 60, 70], [10, 20, 30, 40, 50]).ok, false);
});

test('Star / Centre: exactly one number, which must have been called', () => {
  assert.strictEqual(H.verifyClaim('star', [], [53]).status, 'wrong-count');
  assert.strictEqual(H.verifyClaim('star', [53, 16], [53, 16]).status, 'wrong-count');
  const no = H.verifyClaim('star', [53], [1, 2, 3]);
  assert.strictEqual(no.status, 'not-called');
  assert.match(no.message, /53 has not been called/);
  const yes = H.verifyClaim('star', [53], [1, 53, 3]);
  assert.strictEqual(yes.ok, true);
  assert.strictEqual(yes.completedAt, 2);
  assert.match(yes.message, /Valid Star \/ Centre: this number was called\. Completed at call #2 \(53\), 1 call ago/);
});

test('Second Full House is verified like Full House (all 15, exactly)', () => {
  const nums = T.allNumbers(SAMPLE);
  const calls = nums.slice().reverse();
  assert.strictEqual(H.verifyClaim('full2', nums, calls).ok, true);
  assert.strictEqual(H.verifyClaim('full2', nums.slice(0, 14), calls).status, 'wrong-count');
  assert.strictEqual(H.verifyClaim('full2', nums, calls.slice(1)).ok, false);
});

test('checkTicket reports all nine prizes, including Lucky Seven completion and the star number', () => {
  const calls = [53, 4, 20, 34, 44, 50, 5];
  const r = byId(H.checkTicket(SAMPLE, calls));
  assert.deepStrictEqual(Object.keys(r), ['early5', 'lucky7', 'row1', 'row2', 'row3', 'corners', 'star', 'full', 'full2']);
  assert.strictEqual(r.star.complete, true);
  assert.strictEqual(r.star.completedAt, 1);
  assert.strictEqual(r.early5.completedAt, 5);
  assert.strictEqual(r.lucky7.complete, true);
  assert.strictEqual(r.lucky7.completedAt, 7);
  assert.strictEqual(r.lucky7.marked, 7);
  assert.strictEqual(r.full2.complete, false);
});

test('property: Early Five <= Lucky Seven <= Full House; Star lies inside the middle line; Second Full House equals Full House', () => {
  const rng = Rng.seededRng('prizes');
  for (let t = 0; t < 300; t++) {
    const grid = T.generateTicket(rng);
    const calls = [];
    for (;;) { const n = H.drawNext(calls, rng); if (n === null) break; calls.push(n); }
    const r = byId(H.checkTicket(grid, calls));
    assert.ok(r.early5.completedAt <= r.lucky7.completedAt);
    assert.ok(r.lucky7.completedAt <= r.full.completedAt);
    assert.ok(r.star.completedAt <= r.row2.completedAt);
    assert.strictEqual(r.full2.completedAt, r.full.completedAt);
  }
});

test('findTickets for the new prizes: Lucky Seven (subset), Star (centre number), Second Full House (exact ticket)', () => {
  const reg = new Registry();
  const rng = Rng.seededRng('find2');
  const a = reg.ensurePerson('n:a', 'a', 'Asha');
  reg.issue(a.id, 'excel', rng); reg.issue(a.id, 'excel', rng); reg.issue(a.id, 'excel', rng);
  const data = JSON.parse(JSON.stringify(reg.toJSON()));
  const t = data.tickets[2];
  assert.strictEqual(H.findTickets(data, 'lucky7', T.allNumbers(t.grid).slice(0, 7)).matches.some((m) => m.serial === t.serial), true);
  assert.deepStrictEqual(H.findTickets(data, 'full2', T.allNumbers(t.grid)).matches.map((m) => m.serial), [t.serial]);
  const star = H.findTickets(data, 'star', H.patternNumbers(t.grid, 'star'));
  assert.ok(star.total >= 1 && star.matches.some((m) => m.serial === t.serial));
});
