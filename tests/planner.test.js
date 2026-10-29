const test = require('node:test');
const assert = require('node:assert');
const P = require('../js/planner.js');
const { sampleAoa, shortAoa } = require('./fixtures/sample-data.js');

const plan1 = (rows, opts) => P.planFromRows(shortAoa(rows), opts);
const personTotals = (plan) => Object.fromEntries(plan.people.map((p) => [p.name, p.total]));

test('CNT-025 / E2E-001 sample sheet: 20 rows -> 18 people -> 33 tickets', () => {
  const plan = P.planFromRows(sampleAoa());
  assert.ok(plan.ok);
  assert.strictEqual(plan.rowsRead, 20);
  assert.strictEqual(plan.people.length, 18);
  assert.strictEqual(plan.totalTickets, 33);
  const t = personTotals(plan);
  assert.strictEqual(t['Ananya Shah'], 2);
  assert.strictEqual(t['Arjun Nair'], 8);
  assert.strictEqual(t['VIKRAM SETH'], 3);
  assert.strictEqual(t['Rohit Bansal'], 4);
  assert.strictEqual(t['Karan Joshi'], 2);
  assert.strictEqual(t['Yash Kapoor'], 1);
  assert.strictEqual(t['Ritu Sharma'], 2);
  assert.strictEqual(t['Asha Rao'], 1);
});

test('PRS-006 uses Name column (not Full Name)', () => {
  const plan = P.planFromRows(sampleAoa());
  assert.ok(plan.people.some((p) => p.name === 'VIKRAM SETH'));
  assert.ok(!plan.people.some((p) => p.name === 'Vikram Seth'));
});

test('GRP-008/010 people ordered by first appearance; merged person stays at first position', () => {
  const plan = P.planFromRows(sampleAoa());
  const names = plan.people.map((p) => p.name);
  assert.strictEqual(names[0], 'Asha Rao');
  assert.strictEqual(names.indexOf('Ananya Shah'), 6);
  assert.deepStrictEqual(plan.people.find((p) => p.name === 'Ananya Shah').rows.map((r) => r.rowNum), [8, 20]);
  assert.deepStrictEqual(plan.people.find((p) => p.name === 'VIKRAM SETH').rows.map((r) => r.tickets), [1, 2]);
});

test('PRS-004 reordered columns give the same plan', () => {
  const aoa = sampleAoa();
  const order = aoa[0].map((_, i) => i).reverse();
  const shuffled = aoa.map((r) => order.map((i) => r[i]));
  const a = P.planFromRows(aoa), b = P.planFromRows(shuffled);
  assert.deepStrictEqual(b.people.map((p) => [p.name, p.total]), a.people.map((p) => [p.name, p.total]));
});

test('CNT-001..004 basic counts', () => {
  const plan = plan1([['A', 'a@x', 1, '', ''], ['B', 'b@x', 2, '', ''], ['C', 'c@x', 4, '', ''], ['D', 'd@x', '', '', '']]);
  assert.deepStrictEqual(personTotals(plan), { A: 1, B: 2, C: 4, D: 1 });
  assert.strictEqual(plan.warnings.length, 0);
});

test('CNT-005..007 text counts', () => {
  const plan = plan1([
    ['A', 'a@x', '', 'Save the Children, Bal Raksha Bharat Rs. 2000 (8 tickets)', ''],
    ['B', 'b@x', '', '(1 ticket)', ''],
    ['C', 'c@x', '', '( 8 TICKETS )', '']
  ]);
  assert.deepStrictEqual(personTotals(plan), { A: 8, B: 1, C: 8 });
  assert.strictEqual(plan.warnings.length, 0);
});

test('CNT-008 count and text are added', () => {
  const plan = plan1([['A', 'a@x', 2, '(3 tickets)', '']]);
  assert.strictEqual(plan.people[0].total, 5);
  assert.ok(plan.warnings.some((w) => w.level === 'info'));
});

test('CNT-009/010 text with no N / amount only', () => {
  const plan = plan1([['A', 'a@x', '', 'Supporting Education', ''], ['B', 'b@x', '', 'Rs. 2000', '']]);
  assert.deepStrictEqual(personTotals(plan), { A: 1, B: 1 });
  assert.strictEqual(plan.warnings.length, 1);
  assert.strictEqual(plan.warnings[0].row, 3);
});

test('CNT-011..019 edge counts', () => {
  const plan = plan1([
    ['Zero', 'z@x', '0', '', ''],
    ['Neg', 'n@x', -1, '', ''],
    ['Dec', 'd@x', 2.5, '', ''],
    ['Txt', 't@x', '3 tickets', '', ''],
    ['Word', 'w@x', 'two', '', ''],
    ['Space', 's@x', ' 4 ', '', ''],
    ['Exp', 'e@x', '1e1', '', ''],
    ['Big', 'b@x', 60, '', ''],
    ['Huge', 'h@x', 1000000, '', ''],
    ['Zero+Text', 'zt@x', 0, '(2 tickets)', '']
  ]);
  const t = personTotals(plan);
  assert.strictEqual(t.Zero, undefined);
  assert.strictEqual(t.Neg, undefined);
  assert.strictEqual(t.Dec, 2);
  assert.strictEqual(t.Txt, 3);
  assert.strictEqual(t.Word, 1);
  assert.strictEqual(t.Space, 4);
  assert.strictEqual(t.Exp, 10);
  assert.strictEqual(t.Big, 60);
  assert.strictEqual(t.Huge, undefined);
  assert.strictEqual(t['Zero+Text'], 2);
  const warned = new Set(plan.warnings.filter((w) => w.level === 'warn').map((w) => w.row));
  [2, 3, 4, 6, 9, 10].forEach((r) => assert.ok(warned.has(r), 'row ' + r + ' should warn'));
  assert.strictEqual(plan.skippedRows, 3);
});

test('CNT-020/021 empty and whitespace names are skipped with row number', () => {
  const plan = plan1([['', 'a@x', 2, '', ''], ['   ', 'b@x', 2, '', ''], ['Ok', 'c@x', 1, '', '']]);
  assert.strictEqual(plan.people.length, 1);
  assert.deepStrictEqual(plan.warnings.map((w) => w.row), [2, 3]);
});

test('CNT-022 confirmation = No still gets a ticket, with an info note only', () => {
  const plan = plan1([['H', 'h@x', 1, '', 'No']]);
  assert.strictEqual(plan.people[0].total, 1);
  assert.deepStrictEqual(plan.warnings.map((w) => w.level), ['info']);
});

test('CNT-024 person A: blank row + count 2 -> 3 tickets', () => {
  const plan = plan1([['A', 'a@x', '', '', ''], ['A', 'a@x', 2, '', '']]);
  assert.strictEqual(plan.people.length, 1);
  assert.strictEqual(plan.people[0].total, 3);
});

test('CNT-026 multiple (N tickets) fragments: first used with warning', () => {
  const plan = plan1([['A', 'a@x', '', '(2 tickets) and (5 tickets)', '']]);
  assert.strictEqual(plan.people[0].total, 2);
  assert.ok(plan.warnings.some((w) => w.level === 'warn'));
});

test('GRP-003..007 identity rules', () => {
  const plan = plan1([
    ['Amit', ' AMIT@X.com ', 1, '', ''],
    ['Amit', 'amit@x.com', 1, '', ''],
    ['Bela', '', 1, '', ''],
    ['  bela  ', '', 1, '', ''],
    ['Chris', 'c1@x', 1, '', ''],
    ['Chris', 'c2@x', 1, '', ''],
    ['Dee', 'd@x', 1, '', ''],
    ['Dee Different', 'd@x', 1, '', '']
  ]);
  assert.deepStrictEqual(plan.people.map((p) => [p.name, p.total]), [['Amit', 2], ['Bela', 2], ['Chris', 1], ['Chris', 1], ['Dee', 2]]);
});

test('GRP-013..015 name casing and whitespace', () => {
  assert.strictEqual(plan1([['VIKRAM SETH', 'r@x', 1, '', '']]).people[0].name, 'VIKRAM SETH');
  assert.strictEqual(plan1([['VIKRAM SETH', 'r@x', 1, '', '']], { titleCase: true }).people[0].name, 'Vikram Seth');
  assert.strictEqual(plan1([['  John   Doe ', 'j@x', 1, '', '']]).people[0].name, 'John Doe');
  assert.strictEqual(P.titleCase("o'neil-smith"), "O'Neil-Smith");
});

test('PRS-005 header case/spacing and PRS-010 long count header', () => {
  const aoa = [[' NAME ', 'E-mail', 'How many tickets are you registering for? (anything)'], ['A', 'a@x', 3]];
  const plan = P.planFromRows(aoa);
  assert.strictEqual(plan.people[0].total, 3);
  assert.strictEqual(plan.columns.email, 1);
});

test('PRS-007 missing Name column is a blocking error', () => {
  const plan = P.planFromRows([['Full Name', 'Email'], ['A', 'a@x']]);
  assert.strictEqual(plan.ok, false);
  assert.match(plan.error, /Name/);
});

test('PRS-008/009 missing count and email columns warn but work', () => {
  const plan = P.planFromRows([['Name', 'Donated to other cause(s)? x'], ['A', '(3 tickets)'], ['B', '']]);
  assert.ok(plan.ok);
  assert.deepStrictEqual(personTotals(plan), { A: 3, B: 1 });
  assert.ok(plan.warnings.some((w) => /not found/.test(w.message)));
});

test('PRS-012 empty file / header only', () => {
  assert.strictEqual(P.planFromRows([]).ok, false);
  assert.strictEqual(P.planFromRows([['Name', 'Email']]).ok, false);
  assert.match(P.planFromRows([['Name']]).error, /no data rows/i);
});

test('PRS-016 blank rows are ignored silently, row numbers stay correct', () => {
  const aoa = shortAoa([['A', 'a@x', 1, '', ''], ['', '', '', '', ''], ['', 'only@x', '', '', ''], ['B', 'b@x', 1, '', '']]);
  const plan = P.planFromRows(aoa);
  assert.strictEqual(plan.people.length, 2);
  assert.strictEqual(plan.rowsRead, 3);
  assert.deepStrictEqual(plan.warnings.map((w) => w.row), [4]);
});

test('PRS-018 numeric vs text counts', () => {
  const plan = plan1([['A', 'a@x', 2, '', ''], ['B', 'b@x', '2', '', '']]);
  assert.deepStrictEqual(personTotals(plan), { A: 2, B: 2 });
});

test('PRS-025 duplicate Name header: first one wins', () => {
  const plan = P.planFromRows([['Name', 'Name'], ['First', 'Second']]);
  assert.strictEqual(plan.people[0].name, 'First');
});

test('ROB-004 prototype-pollution-like names are ordinary names', () => {
  const plan = plan1([['__proto__', '', 1, '', ''], ['constructor', '', 1, '', '']]);
  assert.strictEqual(plan.people.length, 2);
  assert.strictEqual(({}).polluted, undefined);
});

test('fingerprint is stable and changes with content', () => {
  const a = P.planFromRows(sampleAoa()), b = P.planFromRows(sampleAoa());
  assert.strictEqual(a.fingerprint, b.fingerprint);
  assert.notStrictEqual(a.fingerprint, plan1([['A', 'a@x', 1, '', '']]).fingerprint);
});

test('rowOffset shifts reported row numbers', () => {
  const plan = P.planFromRows(shortAoa([['', '', '', '', '']].concat([['', 'x@x', 1, '', '']])), { rowOffset: 4 });
  assert.strictEqual(plan.warnings[0].row, 7);
});
