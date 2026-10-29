const test = require('node:test');
const assert = require('node:assert');
const Rng = require('../js/rng.js');
const T = require('../js/ticket.js');

const N = 10000;
function many(n, rng) { const out = []; for (let i = 0; i < n; i++) out.push(T.generateTicket(rng)); return out; }
const rng = Rng.cryptoRng();
const tickets = many(N, rng);

test('GEN-001..009 every generated ticket satisfies R1-R8', () => {
  tickets.forEach((g) => {
    assert.strictEqual(g.length, 3);
    g.forEach((row) => {
      assert.strictEqual(row.length, 9);
      assert.strictEqual(row.filter(Boolean).length, 5);
    });
    const nums = T.allNumbers(g);
    assert.strictEqual(nums.length, 15);
    assert.strictEqual(new Set(nums).size, 15);
    assert.ok(nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 90));
    for (let c = 0; c < 9; c++) {
      const col = [g[0][c], g[1][c], g[2][c]].filter(Boolean);
      assert.ok(col.length >= 1 && col.length <= 3, 'column count');
      const [lo, hi] = T.colRange(c);
      col.forEach((v) => assert.ok(v >= lo && v <= hi, 'range'));
      for (let i = 1; i < col.length; i++) assert.ok(col[i] > col[i - 1], 'ascending');
    }
    assert.ok(T.validateTicket(g).ok);
  });
});

test('GEN-010/011/020/021/022 distributions and coverage', () => {
  const layouts = new Set();
  const seen = new Set();
  const colCounts = Array.from({ length: 9 }, () => new Set());
  tickets.forEach((g) => {
    layouts.add(g.map((r) => r.map((v) => (v ? 1 : 0)).join('')).join('|'));
    T.allNumbers(g).forEach((n) => seen.add(n));
    for (let c = 0; c < 9; c++) colCounts[c].add([g[0][c], g[1][c], g[2][c]].filter(Boolean).length);
  });
  assert.ok(layouts.size > 50, 'layout variety ' + layouts.size);
  for (let n = 1; n <= 90; n++) assert.ok(seen.has(n), 'number ' + n + ' never appears');
  colCounts.forEach((s) => [1, 2, 3].forEach((k) => assert.ok(s.has(k))));
  assert.ok(!seen.has(0));
});

test('GEN-023 number frequency is roughly uniform inside each column', () => {
  const freq = new Map();
  tickets.forEach((g) => T.allNumbers(g).forEach((n) => freq.set(n, (freq.get(n) || 0) + 1)));
  for (let c = 0; c < 9; c++) {
    const [lo, hi] = T.colRange(c);
    const vals = [];
    for (let n = lo; n <= hi; n++) vals.push(freq.get(n));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    vals.forEach((v) => assert.ok(Math.abs(v - mean) / mean < 0.12, `col ${c} skew ${v} vs ${mean}`));
  }
});

test('GEN-012 the supplied sample ticket is valid', () => {
  const sample = [
    [4, 0, 20, 34, 44, 50, 0, 0, 0],
    [5, 16, 0, 0, 0, 53, 64, 75, 0],
    [8, 0, 24, 0, 0, 58, 0, 79, 88]
  ];
  assert.deepStrictEqual(T.validateTicket(sample), { ok: true, errors: [] });
});

test('GEN-013..019 validator rejects rule violations', () => {
  const good = () => [
    [4, 0, 20, 34, 44, 50, 0, 0, 0],
    [5, 16, 0, 0, 0, 53, 64, 75, 0],
    [8, 0, 24, 0, 0, 58, 0, 79, 88]
  ];
  const bad = (mut) => { const g = good(); mut(g); return !T.validateTicket(g).ok; };
  assert.ok(!T.validateTicket(good().slice(0, 2)).ok, 'R1 rows');
  assert.ok(bad((g) => { g[0] = g[0].slice(0, 8); }), 'R1 columns');
  assert.ok(bad((g) => { g[0][6] = 66; }), 'R2/R3 sixteen numbers');
  assert.ok(bad((g) => { g[0][5] = 0; }), 'R3 four in a row');
  assert.ok(bad((g) => { g[0][0] = 10; }), 'R4 10 in col 1');
  assert.ok(bad((g) => { g[2][8] = 91; }), 'R4 91');
  assert.ok(bad((g) => { g[0][0] = 0; g[1][0] = 0; g[2][0] = 0; }), 'R5 empty column');
  assert.ok(bad((g) => { g[0][1] = 11; g[1][1] = 16; g[2][1] = 17; g[0][2] = 0; g[2][2] = 0; g[1][2] = 22; }), 'R3/R5 combos');
  assert.ok(bad((g) => { g[0][0] = 8; g[2][0] = 4; }), 'R6 descending');
  assert.ok(bad((g) => { g[0][0] = 5; }), 'R6/R7 equal values');
  assert.ok(bad((g) => { g[0][0] = 1.5; }), 'R8 non integer');
  assert.ok(bad((g) => { g[0][0] = -4; }), 'R8 negative');
});

test('R5: a column with four numbers is impossible in a 3-row grid but 0 numbers is rejected', () => {
  const g = [
    [0, 11, 20, 30, 40, 50, 60, 70, 80],
    [0, 12, 21, 31, 41, 51, 61, 71, 81],
    [0, 13, 22, 32, 42, 52, 62, 72, 82]
  ];
  assert.ok(!T.validateTicket(g).ok);
});

test('UNQ-001/002 registry of 5000 tickets has unique tickets and unique rows', () => {
  const { Registry: R } = require('../js/registry.js');
  const reg = new R();
  const p = reg.ensurePerson('n:a', 'a', 'A');
  const ts = [];
  for (let i = 0; i < 5000; i++) ts.push(reg.issue(p.id, 'excel', rng));
  assert.strictEqual(new Set(ts.map((t) => T.ticketKey(t.grid))).size, 5000);
  const rows = ts.flatMap((t) => T.rowKeys(t.grid));
  assert.strictEqual(new Set(rows).size, rows.length);
});

test('UNQ-008/009/010 forced collisions are rejected and retries are bounded', () => {
  const { Registry: R, MAX_ATTEMPTS } = require('../js/registry.js');
  const reg = new R();
  const p = reg.ensurePerson('n:a', 'a', 'A');
  const t1 = reg.issue(p.id, 'excel', Rng.seededRng('x'));
  // Same seed produces the same candidate first, which must be rejected; it then re-rolls.
  const t2 = reg.issue(p.id, 'excel', Rng.seededRng('x'));
  assert.notStrictEqual(T.ticketKey(t1.grid), T.ticketKey(t2.grid));
  assert.throws(() => reg.addTicket(p.id, t1.grid, 'excel'), /Duplicate/);

  // A valid candidate sharing exactly one row with an issued ticket is rejected (U2).
  const reg2 = new R();
  const q = reg2.ensurePerson('n:q', 'q', 'Q');
  reg2.addTicket(q.id, [[4, 0, 20, 34, 44, 50, 0, 0, 0], [5, 16, 0, 0, 0, 53, 64, 75, 0], [8, 0, 24, 0, 0, 58, 0, 79, 88]], 'excel');
  const sharesRow = [[4, 0, 20, 34, 44, 50, 0, 0, 0], [5, 17, 0, 0, 0, 53, 65, 75, 0], [9, 0, 25, 0, 0, 59, 0, 78, 89]];
  assert.ok(T.validateTicket(sharesRow).ok);
  assert.ok(T.ticketKey(sharesRow) !== T.ticketKey(reg2.tickets[0].grid));
  assert.strictEqual(reg2.isUnique(sharesRow), false);
  assert.throws(() => reg2.addTicket(q.id, sharesRow, 'excel'), /Duplicate/);

  // Retry exhaustion (UNQ-010): a generator that always yields an already-issued ticket must give up cleanly.
  const original = T.generateTicket;
  T.generateTicket = () => t1.grid.map((r) => r.slice());
  try {
    assert.throws(() => reg.issue(p.id, 'excel', rng), /unique ticket after/);
  } finally {
    T.generateTicket = original;
  }
  assert.ok(MAX_ATTEMPTS > 0);
});

test('RND-004..006 seeded runs are reproducible and valid', () => {
  const a = many(500, Rng.seededRng('abc'));
  const b = many(500, Rng.seededRng('abc'));
  const c = many(500, Rng.seededRng('abd'));
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
  a.forEach((g) => assert.ok(T.validateTicket(g).ok));
  [Rng.seededRng('12345'), Rng.seededRng('सीड'), Rng.seededRng('x'.repeat(1000))].forEach((r) => assert.ok(T.validateTicket(T.generateTicket(r)).ok));
});

test('RND-001 default random runs differ', () => {
  const a = many(20, Rng.cryptoRng());
  const b = many(20, Rng.cryptoRng());
  assert.notDeepStrictEqual(a, b);
});

test('randomSeed returns a non-empty string', () => {
  assert.ok(Rng.randomSeed().length > 3);
});
