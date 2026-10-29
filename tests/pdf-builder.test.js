const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { jsPDF } = require('../lib/jspdf.umd.min.js');
const Png = require('../js/png.js');
const Pdf = require('../js/pdf-builder.js');
const Rng = require('../js/rng.js');
const P = require('../js/planner.js');
const { Registry } = require('../js/registry.js');
const { sampleAoa, shortAoa } = require('./fixtures/sample-data.js');

// A tiny valid PNG whose pixel colour depends on `seed` (jsPDF de-duplicates identical images).
function tinyPng(seed) {
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
    out.writeUInt32BE(Png.crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.from([0, seed & 255, (seed >> 8) & 255, 7, 200, 100, seed & 255]);
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return { data: 'data:image/png;base64,' + bytes.toString('base64'), format: 'PNG' };
}
const pageImages = (n) => Array.from({ length: n }, (_, i) => tinyPng(i + 1));
const pdfText = (doc) => Buffer.from(doc.output('arraybuffer')).toString('latin1');
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---------- geometry ----------
test('sheet: 12 tickets per page in 2 columns, two sets of 6 (like the reference sheet)', () => {
  assert.strictEqual(Pdf.PER_PAGE, 12);
  assert.strictEqual(Pdf.SET_SIZE, 6);
  assert.strictEqual(Pdf.COLS, 2);
  const slots = Array.from({ length: 12 }, (_, i) => Pdf.slotPosition(i));
  assert.deepStrictEqual(slots.map((s) => s.set), [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
  assert.strictEqual(new Set(slots.slice(0, 6).map((s) => s.y)).size, 3, 'three rows per set');
  assert.strictEqual(new Set(slots.map((s) => s.x)).size, 2, 'two columns');
});

test('sheet: slots are inside the page margins and never overlap', () => {
  const slots = Array.from({ length: 12 }, (_, i) => Pdf.slotPosition(i));
  slots.forEach((s) => {
    assert.ok(s.x >= 10 && s.x + s.w <= Pdf.PAGE_W - 10, 'side margins');
    assert.ok(s.y >= Pdf.RULE_Y + Pdf.SET_LABEL_H, 'below the title rule and set label');
    assert.ok(s.y + s.h <= Pdf.FOOTER_Y - 6, 'above the footer');
  });
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) assert.ok(!overlap(slots[i], slots[j]), i + ' overlaps ' + j);
});

test('sheet: ticket cells are about square and large enough to read (>= 9 mm)', () => {
  const stripH = 5.6;
  const cellW = (Pdf.TICKET_W - 3) / 9, cellH = (Pdf.TICKET_H - stripH - 1.5) / 3;
  assert.ok(cellW >= 9 && cellH >= 9, cellW + ' x ' + cellH);
  assert.ok(Math.abs(cellW - cellH) < 0.5);
});

test('sheet: set labels, separator and footer sit in the free space between blocks', () => {
  const s0bottom = Pdf.ticketsTop(0) + Pdf.SET_H;
  assert.ok(Pdf.setSeparatorY(1) > s0bottom + 2 && Pdf.setSeparatorY(1) < Pdf.setLabelY(1) - 2, 'separator between the two sets');
  assert.ok(Pdf.setLabelY(0) > Pdf.RULE_Y, 'first set label below the title rule');
  const lastBottom = Pdf.ticketsTop(1) + Pdf.SET_H;
  assert.ok(lastBottom < Pdf.FOOTER_Y - 6, 'second set ends above the footer: ' + lastBottom);
  assert.ok(Pdf.PAGE_H - lastBottom >= 15);
});

// ---------- pagination ----------
test('pageCount: 12 tickets per page', () => {
  assert.deepStrictEqual([0, 1, 6, 7, 12, 13, 24, 25, 28].map(Pdf.pageCount), [1, 1, 1, 1, 1, 2, 2, 3, 3]);
});

test('paginate: pages of 12, sets of 6, partial last set/page allowed', () => {
  const items = Array.from({ length: 28 }, (_, i) => i + 1);
  const pages = Pdf.paginate(items);
  assert.deepStrictEqual(pages.map((p) => p.items.length), [12, 12, 4]);
  assert.deepStrictEqual(pages[0].sets.map((s) => s.length), [6, 6]);
  assert.deepStrictEqual(pages[2].sets.map((s) => s.length), [4]);
  assert.deepStrictEqual(pages.flatMap((p) => p.items), items, 'order preserved');
  assert.deepStrictEqual(Pdf.paginate([1, 2, 3, 4, 5, 6, 7]).map((p) => p.sets.map((s) => s.length)), [[6, 1]]);
  assert.strictEqual(Pdf.paginate([]).length, 1);
});

// ---------- PDF assembly ----------
for (const n of [1, 2, 3, 5]) {
  test('buildPdf: ' + n + ' page image(s) -> ' + n + ' A4 page(s), one image each', () => {
    const doc = Pdf.buildPdf(jsPDF, pageImages(n), { title: 'Test' });
    const txt = pdfText(doc);
    assert.ok(txt.startsWith('%PDF-'));
    assert.strictEqual(doc.getNumberOfPages(), n);
    assert.strictEqual((txt.match(/\/Type \/Page(?!s)/g) || []).length, n);
    assert.strictEqual((txt.match(/\/Subtype \/Image/g) || []).length, n);
    const mb = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(txt);
    assert.ok(Math.abs(mb[1] - 595.28) < 0.5 && Math.abs(mb[2] - 841.89) < 0.5, 'A4 MediaBox');
    assert.ok(/%%EOF\s*$/.test(txt));
  });
}

test('buildPdf: the page image fills the whole A4 page (no margins, nothing to crop)', () => {
  const txt = pdfText(Pdf.buildPdf(jsPDF, pageImages(1), { compress: false }));
  const m = /([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/.exec(txt);
  assert.ok(Math.abs(m[1] - 595.28) < 0.5 && Math.abs(m[2] - 841.89) < 0.5, 'size ' + m[1] + 'x' + m[2]);
  assert.ok(Math.abs(m[3]) < 0.01 && Math.abs(m[4]) < 0.5, 'origin ' + m[3] + ',' + m[4]);
});

// ---------- file names ----------
function issued(rows, rng) {
  const reg = new Registry();
  reg.issuePlan(P.planFromRows(shortAoa(rows)), rng || Rng.cryptoRng());
  return reg;
}

test('file names: one PDF per person; PNG per page (Name.png or Name_1.png ...)', () => {
  const reg = issued([['Rohit Bansal', 's@x', 4, '', ''], ['Big Buyer', 'b@x', 13, '', ''], ['Muskaan Hooda 🐾', 'm@x', 28, '', '']]);
  const files = Pdf.buildPersonFiles(reg.display());
  assert.deepStrictEqual(files.map((f) => f.fileName), ['Rohit Bansal.pdf', 'Big Buyer.pdf', 'Muskaan Hooda 🐾.pdf']);
  assert.deepStrictEqual(files.map((f) => f.pageCount), [1, 2, 3]);
  assert.deepStrictEqual(files[0].pngNames, ['Rohit Bansal.png']);
  assert.deepStrictEqual(files[1].pngNames, ['Big Buyer_1.png', 'Big Buyer_2.png']);
  assert.deepStrictEqual(files[2].pngNames, ['Muskaan Hooda 🐾_1.png', 'Muskaan Hooda 🐾_2.png', 'Muskaan Hooda 🐾_3.png']);
});

test('file names: sanitising, duplicates (case-insensitive) and PNG collisions', () => {
  const reg = issued([
    ['A/B:C*D?', 'x@x', 1, '', ''], ['///', 'y@x', 1, '', ''], ['Amit', 'a1@x', 1, '', ''], ['AMIT', 'a2@x', 13, '', ''],
    ['Raj_1', 'r1@x', 1, '', ''], ['Raj', 'r2@x', 13, '', '']
  ]);
  const files = Pdf.buildPersonFiles(reg.display());
  assert.strictEqual(files[0].fileName, 'ABCD.pdf');
  assert.strictEqual(files[1].fileName, 'Ticket_' + files[1].tickets[0].serial + '.pdf');
  assert.deepStrictEqual([files[2].fileName, files[3].fileName], ['Amit.pdf', 'AMIT (2).pdf']);
  assert.deepStrictEqual(files[3].pngNames, ['AMIT (2)_1.png', 'AMIT (2)_2.png']);
  const pdfs = files.map((f) => f.fileName.toLowerCase());
  const pngs = files.flatMap((f) => f.pngNames).map((n) => n.toLowerCase());
  assert.strictEqual(new Set(pdfs).size, pdfs.length);
  assert.strictEqual(new Set(pngs).size, pngs.length, 'no PNG collides ("Raj_1.png" single vs "Raj" page 1): ' + pngs.join(', '));
});

test('sample sheet: 18 people -> 18 PDFs holding 33 tickets in request order; Arjun (8) fits one page', () => {
  const reg = new Registry();
  reg.issuePlan(P.planFromRows(sampleAoa()), Rng.cryptoRng());
  const files = Pdf.buildPersonFiles(reg.display());
  assert.strictEqual(files.length, 18);
  assert.strictEqual(files.reduce((s, f) => s + f.tickets.length, 0), 33);
  const byName = Object.fromEntries(files.map((f) => [f.person.name, f]));
  assert.strictEqual(byName['Arjun Nair'].tickets.length, 8);
  assert.strictEqual(byName['Arjun Nair'].pageCount, 1);
  assert.deepStrictEqual(byName['Arjun Nair'].pngNames, ['Arjun Nair.png']);
  assert.strictEqual(byName['Ananya Shah'].fileName, 'Ananya Shah.pdf');
  assert.strictEqual(files[0].person.name, 'Asha Rao');
  files.forEach((f) => {
    const serials = f.tickets.map((t) => t.serial);
    assert.deepStrictEqual(serials, serials.slice().sort((a, b) => a - b));
  });
});

// ---------- landscape pages (one ticket per page, the original look) ----------
test('buildPdf: landscape pages are A4 landscape (841.89 x 595.28 pt) and the image fills them', () => {
  const imgs = pageImages(3).map((i) => Object.assign({ orientation: 'landscape' }, i));
  const doc = Pdf.buildPdf(jsPDF, imgs, { compress: false });
  const txt = pdfText(doc);
  assert.strictEqual(doc.getNumberOfPages(), 3);
  const boxes = txt.match(/\/MediaBox \[0 0 [\d.]+ [\d.]+\]/g);
  assert.strictEqual(boxes.length, 3);
  boxes.forEach((b) => { const m = /\[0 0 ([\d.]+) ([\d.]+)\]/.exec(b); assert.ok(Math.abs(m[1] - 841.89) < 0.5 && Math.abs(m[2] - 595.28) < 0.5, b); });
  const cm = /([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/.exec(txt);
  assert.ok(Math.abs(cm[1] - 841.89) < 0.5 && Math.abs(cm[2] - 595.28) < 0.5, 'image fills the landscape page');
});

test('buildPdf: pages may mix orientations', () => {
  const imgs = [Object.assign({ orientation: 'landscape' }, tinyPng(1)), tinyPng(2)];
  const txt = pdfText(Pdf.buildPdf(jsPDF, imgs, { compress: false }));
  const boxes = (txt.match(/\/MediaBox \[0 0 [\d.]+ [\d.]+\]/g) || []).map((b) => /\[0 0 ([\d.]+) ([\d.]+)\]/.exec(b).slice(1).map(Number));
  assert.ok(boxes[0][0] > boxes[0][1], 'first page landscape');
  assert.ok(boxes[1][0] < boxes[1][1], 'second page portrait');
});

test('CSV (ticket layout): one row per ticket, per-ticket PNG name, page = ticket number, empty set', () => {
  const reg = issued([['Ananya Shah', 'n@x', 3, '', ''], ['Solo', 's@x', 1, '', '']]);
  const lines = Pdf.buildCsv(reg.display(), 'ticket').trim().split('\r\n');
  assert.strictEqual(lines.length, 5);
  assert.ok(lines[1].startsWith('#0001,Ananya Shah,1,3,1,,Ananya Shah.pdf,Ananya Shah_1.png,'), lines[1].slice(0, 80));
  assert.ok(lines[3].startsWith('#0003,Ananya Shah,3,3,3,,Ananya Shah.pdf,Ananya Shah_3.png,'));
  assert.ok(lines[4].startsWith('#0004,Solo,1,1,1,,Solo.pdf,Solo.png,'));
});

// ---------- CSV ----------
test('CSV: one row per ticket with page, set, PDF and PNG columns; safe against formula injection', () => {
  const reg = issued([['Smith, "Bob"', 'b@x', 13, '', ''], ['=cmd|x', 'c@x', 1, '', '']]);
  const csv = Pdf.buildCsv(reg.display());
  assert.strictEqual(csv.charCodeAt(0), 0xFEFF);
  const lines = csv.trim().split('\r\n');
  assert.strictEqual(lines.length, 1 + 14);
  assert.ok(lines[0].startsWith('Ticket ID,Name,Ticket No.,Tickets For Person,Page,Set,PDF file,PNG file'));
  assert.ok(lines[1].startsWith('#0001,"Smith, ""Bob""",1,13,1,1,'));
  assert.ok(lines[7].includes(',7,13,1,2,'), 'ticket 7 is page 1, set 2: ' + lines[7].slice(0, 60));
  assert.ok(lines[13].includes(',13,13,2,1,'), 'ticket 13 is page 2, set 1');
  assert.ok(lines[1].includes('_1.png') && lines[13].includes('_2.png'), 'PNG page names');
  assert.ok(lines[14].includes("'=cmd|x"));
});
