/* Tambola ticket generation and validation (3x9 grid, 15 numbers, 90-number format).
   A grid is an array of 3 rows, each an array of 9 numbers where 0 means blank. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./rng.js') : root.TambolaRng);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TambolaTicket = api;
})(typeof self !== 'undefined' ? self : this, function (Rng) {
  'use strict';

  const ROWS = 3, COLS = 9, PER_ROW = 5, TOTAL = 15;

  function colRange(c) {
    if (c === 0) return [1, 9];
    if (c === 8) return [80, 90];
    return [c * 10, c * 10 + 9];
  }

  // Column counts: every column starts at 1, the remaining 6 numbers go to random columns (max 3 each).
  function pickColumnCounts(rng) {
    const counts = new Array(COLS).fill(1);
    let remaining = TOTAL - COLS;
    while (remaining > 0) {
      const open = [];
      for (let c = 0; c < COLS; c++) if (counts[c] < ROWS) open.push(c);
      counts[open[Rng.randInt(rng, open.length)]]++;
      remaining--;
    }
    return counts;
  }

  // Rejection-sample a row placement so that every row ends with exactly 5 numbers.
  function pickPlacement(rng, counts) {
    for (let attempt = 0; attempt < 2000; attempt++) {
      const rowTotals = [0, 0, 0];
      const placement = [];
      for (let c = 0; c < COLS; c++) {
        const rows = [0, 1, 2];
        for (let i = rows.length - 1; i > 0; i--) {
          const j = Rng.randInt(rng, i + 1);
          const t = rows[i]; rows[i] = rows[j]; rows[j] = t;
        }
        const chosen = rows.slice(0, counts[c]).sort((a, b) => a - b);
        chosen.forEach(function (r) { rowTotals[r]++; });
        placement.push(chosen);
      }
      if (rowTotals[0] === PER_ROW && rowTotals[1] === PER_ROW && rowTotals[2] === PER_ROW) return placement;
    }
    return null;
  }

  function pickNumbers(rng, c, n) {
    const range = colRange(c);
    const pool = [];
    for (let v = range[0]; v <= range[1]; v++) pool.push(v);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Rng.randInt(rng, i + 1);
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, n).sort((a, b) => a - b);
  }

  function generateTicket(rng) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const counts = pickColumnCounts(rng);
      const placement = pickPlacement(rng, counts);
      if (!placement) continue;
      const grid = [new Array(COLS).fill(0), new Array(COLS).fill(0), new Array(COLS).fill(0)];
      for (let c = 0; c < COLS; c++) {
        const nums = pickNumbers(rng, c, counts[c]);
        placement[c].forEach(function (r, i) { grid[r][c] = nums[i]; });
      }
      if (validateTicket(grid).ok) return grid;
    }
    throw new Error('Unable to generate a valid ticket');
  }

  // Returns { ok, errors[] } checking rules R1-R8.
  function validateTicket(grid) {
    const errors = [];
    if (!Array.isArray(grid) || grid.length !== ROWS) return { ok: false, errors: ['R1: grid must have 3 rows'] };
    for (let r = 0; r < ROWS; r++) {
      if (!Array.isArray(grid[r]) || grid[r].length !== COLS) return { ok: false, errors: ['R1: each row must have 9 columns'] };
    }
    const seen = new Set();
    let total = 0;
    for (let r = 0; r < ROWS; r++) {
      let rowCount = 0;
      for (let c = 0; c < COLS; c++) {
        const v = grid[r][c];
        if (v === 0 || v === null || v === undefined) continue;
        if (!Number.isInteger(v) || v < 1 || v > 90) { errors.push('R8: invalid number ' + v); continue; }
        const range = colRange(c);
        if (v < range[0] || v > range[1]) errors.push('R4: ' + v + ' not allowed in column ' + (c + 1));
        if (seen.has(v)) errors.push('R7: duplicate number ' + v);
        seen.add(v);
        rowCount++; total++;
      }
      if (rowCount !== PER_ROW) errors.push('R3: row ' + (r + 1) + ' has ' + rowCount + ' numbers');
    }
    if (total !== TOTAL) errors.push('R2: ticket has ' + total + ' numbers');
    for (let c = 0; c < COLS; c++) {
      let count = 0, prev = 0;
      for (let r = 0; r < ROWS; r++) {
        const v = grid[r][c];
        if (!v) continue;
        count++;
        if (v <= prev) errors.push('R6: column ' + (c + 1) + ' not ascending');
        prev = v;
      }
      if (count < 1 || count > 3) errors.push('R5: column ' + (c + 1) + ' has ' + count + ' numbers');
    }
    return { ok: errors.length === 0, errors };
  }

  function allNumbers(grid) {
    const out = [];
    grid.forEach(function (row) { row.forEach(function (v) { if (v) out.push(v); }); });
    return out.sort(function (a, b) { return a - b; });
  }

  function ticketKey(grid) { return allNumbers(grid).join(','); }

  function rowKeys(grid) {
    return grid.map(function (row) { return row.filter(Boolean).join(','); });
  }

  return { ROWS, COLS, PER_ROW, TOTAL, colRange, generateTicket, validateTicket, allNumbers, ticketKey, rowKeys };
});
