const test = require('node:test');
const assert = require('node:assert');
const Rng = require('../js/rng.js');
const T = require('../js/ticket.js');
const P = require('../js/planner.js');
const { Registry, formatSerial } = require('../js/registry.js');
const X = require('../js/exporter.js');
const { sampleAoa, shortAoa } = require('./fixtures/sample-data.js');

const rng = Rng.cryptoRng();
function issued(rows, opts) {
  const reg = new Registry();
  reg.issuePlan(P.planFromRows(shortAoa(rows), opts), rng);
  return reg;
}
const files = (reg) => X.buildFileList(reg.display()).map((f) => f.fileName);

test('FIL-001..004/016 sample file names and 33 files', () => {
  const reg = new Registry();
  reg.issuePlan(P.planFromRows(sampleAoa()), rng);
  const f = files(reg);
  assert.strictEqual(f.length, 33);
  assert.strictEqual(new Set(f.map((x) => x.toLowerCase())).size, 33);
  assert.ok(f.includes('Asha Rao.png'));
  assert.ok(f.includes('Yash Kapoor.png'));
  ['Ananya Shah_1.png', 'Ananya Shah_2.png', 'Rohit Bansal_4.png', 'Arjun Nair_8.png', 'VIKRAM SETH_3.png', 'Ritu Sharma_2.png'].forEach((n) => assert.ok(f.includes(n), n));
  assert.ok(!f.includes('Ananya Shah.png'));
});

test('E2E-003 / GRP-009/011 ticket order follows the request order, merged tickets contiguous', () => {
  const reg = new Registry();
  reg.issuePlan(P.planFromRows(sampleAoa()), rng);
  const list = X.buildFileList(reg.display());
  const names = list.map((l) => l.name);
  const plan = P.planFromRows(sampleAoa());
  assert.deepStrictEqual(names, plan.people.flatMap((p) => Array(p.total).fill(p.name)));
  const nancy = list.filter((l) => l.name === 'Ananya Shah');
  assert.deepStrictEqual(nancy.map((n) => [n.index, n.total]), [[1, 2], [2, 2]]);
});

test('GRP-012 serials are increasing with no gaps', () => {
  const reg = new Registry();
  reg.issuePlan(P.planFromRows(sampleAoa()), rng);
  assert.deepStrictEqual(reg.tickets.map((t) => t.serial), Array.from({ length: 33 }, (_, i) => i + 1));
  assert.strictEqual(formatSerial(42), '#0042');
});

test('FIL-005..010 sanitising', () => {
  assert.strictEqual(X.sanitizeName('A/B:C*D?'), 'ABCD');
  assert.strictEqual(X.sanitizeName('CON'), '_CON');
  assert.strictEqual(X.sanitizeName('  Name. . '), 'Name');
  assert.strictEqual(X.sanitizeName('अनुराग Zoë'), 'अनुराग Zoë');
  assert.ok(X.sanitizeName('x'.repeat(120)).length <= 100);
  assert.strictEqual(X.sanitizeName('///'), '');
  assert.strictEqual(X.sanitizeName('a\u0001b'), 'ab');
  const reg = issued([['///', 'a@x', 1, '', '']]);
  assert.match(files(reg)[0], /^Ticket_1\.png$/);
});

test('FIL-011/012 same name for different people never collides (case-insensitive)', () => {
  const reg = issued([['Amit', 'a1@x', 1, '', ''], ['AMIT', 'a2@x', 2, '', ''], ['amit', 'a3@x', 1, '', '']]);
  const f = files(reg);
  assert.strictEqual(new Set(f.map((x) => x.toLowerCase())).size, f.length);
  assert.deepStrictEqual(f, ['Amit.png', 'AMIT (2)_1.png', 'AMIT (2)_2.png', 'amit (3).png']);
});

test('FIL-013 "Raj_1" single person vs "Raj" with two tickets', () => {
  const reg = issued([['Raj_1', 'r1@x', 1, '', ''], ['Raj', 'r2@x', 2, '', '']]);
  const f = files(reg);
  assert.strictEqual(new Set(f.map((x) => x.toLowerCase())).size, 3);
});

test('FIL-019 walk-in changes naming for an existing person', () => {
  const reg = issued([['Asha', 'a@x', 1, '', '']]);
  assert.deepStrictEqual(files(reg), ['Asha.png']);
  const p = reg.ensurePerson('n:asha', 'asha', 'asha');
  assert.strictEqual(p.name, 'Asha');
  reg.issue(p.id, 'walkin', rng);
  assert.deepStrictEqual(files(reg), ['Asha_1.png', 'Asha_2.png']);
});

test('UNQ-004/005 excel + walk-in and walk-in + excel are all unique', () => {
  const check = (reg) => {
    const keys = reg.tickets.map((t) => T.ticketKey(t.grid));
    assert.strictEqual(new Set(keys).size, keys.length);
    const rows = reg.tickets.flatMap((t) => T.rowKeys(t.grid));
    assert.strictEqual(new Set(rows).size, rows.length);
  };
  const a = new Registry();
  a.issuePlan(P.planFromRows(sampleAoa()), rng);
  const w = a.ensurePerson('n:walkin', 'walkin', 'Walkin');
  for (let i = 0; i < 50; i++) a.issue(w.id, 'walkin', rng);
  assert.strictEqual(a.tickets.length, 83);
  check(a);
  const b = new Registry();
  const w2 = b.ensurePerson('n:walkin', 'walkin', 'Walkin');
  for (let i = 0; i < 20; i++) b.issue(w2.id, 'walkin', rng);
  b.issuePlan(P.planFromRows(sampleAoa()), rng);
  assert.strictEqual(b.tickets.length, 53);
  check(b);
});

test('WLK-008/017 walk-in with existing name continues numbering; different email people remain separate', () => {
  const reg = issued([['Chris', 'c1@x', 1, '', ''], ['Chris', 'c2@x', 1, '', '']]);
  assert.strictEqual(reg.people.length, 2);
  const match = reg.findPersonByNameKey('chris');
  assert.ok(match);
  reg.issue(match.id, 'walkin', rng);
  assert.deepStrictEqual(files(reg), ['Chris_1.png', 'Chris_2.png', 'Chris (2).png']);
});

test('PER-006 upload fingerprint remembered', () => {
  const plan = P.planFromRows(sampleAoa());
  const reg = new Registry();
  assert.strictEqual(reg.hasUpload(plan.fingerprint), false);
  reg.issuePlan(plan, rng);
  assert.strictEqual(reg.hasUpload(plan.fingerprint), true);
});

test('PER-010/019 JSON round trip keeps uniqueness for later tickets', () => {
  const reg = new Registry();
  reg.issuePlan(P.planFromRows(sampleAoa()), rng);
  const json = JSON.parse(JSON.stringify(reg.toJSON()));
  const back = Registry.fromJSON(json);
  assert.strictEqual(back.tickets.length, 33);
  assert.strictEqual(back.serialCounter, 33);
  assert.deepStrictEqual(back.display().map((g) => g.tickets.map((t) => t.grid)), reg.display().map((g) => g.tickets.map((t) => t.grid)));
  const p = back.ensurePerson('n:new', 'new', 'New');
  const t = back.issue(p.id, 'walkin', rng);
  assert.strictEqual(t.serial, 34);
  reg.tickets.forEach((old) => assert.strictEqual(back.isUnique(old.grid), false));
});

test('PER-011..013 import validation', () => {
  assert.throws(() => Registry.fromJSON(null));
  assert.throws(() => Registry.fromJSON({ version: 99, people: [], tickets: [] }), /version/);
  const reg = issued([['A', 'a@x', 2, '', '']]);
  const data = JSON.parse(JSON.stringify(reg.toJSON()));
  const dup = JSON.parse(JSON.stringify(data));
  dup.tickets[1].grid = dup.tickets[0].grid;
  dup.tickets[1].serial = 99;
  assert.throws(() => Registry.fromJSON(dup), /duplicates/);
  const broken = JSON.parse(JSON.stringify(data));
  broken.tickets[0].grid[0][0] = 99;
  assert.throws(() => Registry.fromJSON(broken), /breaks the rules/);
  const orphan = JSON.parse(JSON.stringify(data));
  orphan.tickets[0].personId = 999;
  assert.throws(() => Registry.fromJSON(orphan), /unknown person/);
});

test('PER-014 merge flags conflicts and keeps uniqueness', () => {
  const a = issued([['A', 'a@x', 3, '', '']]);
  const b = Registry.fromJSON(JSON.parse(JSON.stringify(a.toJSON())));
  const r = a.merge(b);
  assert.deepStrictEqual(r, { added: 0, skipped: 3 });
  const c = issued([['C', 'c@x', 2, '', '']]);
  const r2 = a.merge(c);
  assert.strictEqual(r2.added + r2.skipped, 2);
  assert.strictEqual(a.tickets.length, 3 + r2.added);
});

test('FIL-020/021 CSV export', () => {
  const reg = issued([['Smith, "Bob"', 'b@x', 2, '', ''], ['=cmd|x', 'c@x', 1, '', ''], ['@SUM(A1)', 'd@x', 1, '', '']]);
  const csv = X.buildCsv(reg.display());
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF);
  const lines = csv.trim().split('\r\n');
  assert.strictEqual(lines.length, 5);
  assert.ok(lines[1].startsWith('#0001,"Smith, ""Bob""",1,2,'));
  assert.ok(lines[3].includes("'=cmd|x"));
  assert.ok(lines[4].includes("'@SUM(A1)"));
  const cols = lines[1].match(/("([^"]|"")*"|[^,]*)(,|$)/g).length;
  assert.ok(cols >= 10);
});

test('ROB-002 HTML in names stays plain text in data and exports', () => {
  const reg = issued([['<img src=x onerror=alert(1)>', 'x@x', 1, '', '']]);
  assert.strictEqual(reg.people[0].name, '<img src=x onerror=alert(1)>');
  assert.ok(X.buildCsv(reg.display()).includes('<img src=x onerror=alert(1)>'));
});

test('PRF-001/UNQ-012 performance: 3000 tickets quickly and unique', () => {
  const reg = new Registry();
  const p = reg.ensurePerson('n:p', 'p', 'P');
  const t0 = Date.now();
  for (let i = 0; i < 3000; i++) reg.issue(p.id, 'excel', rng);
  assert.ok(Date.now() - t0 < 5000, 'took ' + (Date.now() - t0));
  assert.strictEqual(new Set(reg.tickets.map((t) => T.ticketKey(t.grid))).size, 3000);
});

test('RND-004 seeded plan is reproducible with an empty registry', () => {
  const run = (seed) => {
    const reg = new Registry();
    reg.issuePlan(P.planFromRows(sampleAoa()), Rng.seededRng(seed));
    return reg.tickets.map((t) => t.grid);
  };
  assert.deepStrictEqual(run('s1'), run('s1'));
  assert.notDeepStrictEqual(run('s1'), run('s2'));
});
