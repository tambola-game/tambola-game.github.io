// Independent verification of the Tambola rules. Deliberately shares NO code with js/ticket.js's validator:
// it only calls generateTicket() and re-derives every rule from scratch.
const test = require('node:test');
const assert = require('node:assert');
const Rng = require('../js/rng.js');
const T = require('../js/ticket.js');

// Standard 90-number Tambola column of a number: 1-9 -> 0, 10-19 -> 1, ... 70-79 -> 7, 80-90 -> 8.
const columnOf = (n) => (n === 90 ? 8 : Math.floor(n / 10));

// Returns a list of rule violations (empty = strictly valid).
function violations(grid) {
  const v = [];
  if (!Array.isArray(grid) || grid.length !== 3) return ['not 3 rows'];
  if (grid.some((r) => !Array.isArray(r) || r.length !== 9)) return ['not 9 columns'];
  const cells = [];
  grid.forEach((row, r) => row.forEach((val, c) => { if (val !== 0) cells.push({ r, c, val }); }));
  if (cells.length !== 15) v.push('count ' + cells.length);
  for (let r = 0; r < 3; r++) if (cells.filter((x) => x.r === r).length !== 5) v.push('row ' + r + ' not 5');
  if (new Set(cells.map((x) => x.val)).size !== cells.length) v.push('duplicate number');
  cells.forEach((x) => {
    if (!Number.isInteger(x.val) || x.val < 1 || x.val > 90) v.push('out of 1..90: ' + x.val);
    else if (columnOf(x.val) !== x.c) v.push(x.val + ' in wrong column ' + x.c);
  });
  for (let c = 0; c < 9; c++) {
    const col = cells.filter((x) => x.c === c).sort((a, b) => a.r - b.r);
    if (col.length < 1 || col.length > 3) v.push('column ' + c + ' has ' + col.length);
    for (let i = 1; i < col.length; i++) if (col[i].val <= col[i - 1].val) v.push('column ' + c + ' not ascending');
  }
  return v;
}

test('independent checker catches the sample ticket as valid and broken tickets as invalid', () => {
  const sample = [[4, 0, 20, 34, 44, 50, 0, 0, 0], [5, 16, 0, 0, 0, 53, 64, 75, 0], [8, 0, 24, 0, 0, 58, 0, 79, 88]];
  assert.deepStrictEqual(violations(sample), []);
  const broken = JSON.parse(JSON.stringify(sample));
  broken[0][0] = 12; // wrong column
  assert.ok(violations(broken).length > 0);
  const six = JSON.parse(JSON.stringify(sample));
  six[0][1] = 11; // 6 numbers in a row, 16 total
  assert.ok(violations(six).length > 0);
});

test('200,000 generated tickets are strictly valid under the independent checker', () => {
  const patterns = new Set();
  for (let batch = 0; batch < 10; batch++) {
    const rng = Rng.seededRng('independent-' + batch);
    for (let i = 0; i < 20000; i++) {
      const g = T.generateTicket(rng);
      const v = violations(g);
      if (v.length) assert.fail('ticket ' + batch + '/' + i + ' invalid: ' + v.join('; ') + ' ' + JSON.stringify(g));
      patterns.add([0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => [g[0][c], g[1][c], g[2][c]].filter(Boolean).length).join(''));
    }
  }
  // 2,000 tickets from the real crypto source as well.
  const crypto = Rng.cryptoRng();
  for (let i = 0; i < 2000; i++) assert.deepStrictEqual(violations(T.generateTicket(crypto)), []);
  // Every legal per-column count vector (each 1..3, total 15) must be reachable.
  let expected = 0;
  const walk = (col, sum) => {
    if (col === 9) { if (sum === 15) expected++; return; }
    for (let k = 1; k <= 3; k++) walk(col + 1, sum + k);
  };
  walk(0, 0);
  console.log('column-count vectors reachable: ' + patterns.size + ' of ' + expected);
  assert.strictEqual(patterns.size, expected);
});

test('independent count of legal blank layouts and membership of generated layouts', () => {
  // Enumerate every 3x9 layout with 5 per row and every column used.
  const rows = [];
  for (let m = 0; m < 512; m++) { let b = 0; for (let i = 0; i < 9; i++) if (m & (1 << i)) b++; if (b === 5) rows.push(m); }
  const legal = new Set();
  for (const a of rows) for (const b of rows) for (const c of rows) if ((a | b | c) === 511) legal.add(a + ',' + b + ',' + c);
  console.log('legal blank layouts: ' + legal.size);
  const rng = Rng.seededRng('layouts');
  const seen = new Set();
  for (let i = 0; i < 50000; i++) {
    const g = T.generateTicket(rng);
    const key = g.map((r) => r.reduce((m, v, c) => (v ? m | (1 << c) : m), 0)).join(',');
    assert.ok(legal.has(key), 'generated layout not in the legal set: ' + key);
    seen.add(key);
  }
  console.log('distinct legal layouts seen in 50,000 tickets: ' + seen.size);
  assert.ok(seen.size > 10000);
});

test('number frequencies match the column sizes (no number is favoured or starved)', () => {
  const rng = Rng.seededRng('frequency');
  const N = 100000, freq = new Array(91).fill(0);
  for (let i = 0; i < N; i++) T.generateTicket(rng).forEach((r) => r.forEach((v) => { if (v) freq[v]++; }));
  // Numbers sharing a column must appear equally often (columns 1 and 9 hold 9 and 11 numbers, so compare within a column).
  for (let c = 0; c < 9; c++) {
    const nums = []; for (let n = 1; n <= 90; n++) if (columnOf(n) === c) nums.push(n);
    const mean = nums.reduce((s, n) => s + freq[n], 0) / nums.length;
    nums.forEach((n) => assert.ok(Math.abs(freq[n] - mean) / mean < 0.05, 'number ' + n + ' freq ' + freq[n] + ' vs mean ' + mean));
  }
});

module.exports = { violations };
