const test = require('node:test');
const assert = require('node:assert');
const { TambolaRender: R } = require('../js/render.js');

// Where the ticket (plus its dashed cut line) sits on a sheet, in sheet pixels.
function ticketBox(kind) {
  const s = R.SHEETS[kind];
  const w = Math.floor(R.W * (s.ticketW / R.W));
  const h = Math.floor(R.H * (s.ticketW / R.W));
  const x = Math.round((s.w - w) / 2);
  const y = s.top === null ? Math.round((s.h - h) / 2) : s.top;
  const m = R.CUT_MARGIN;
  return { s, left: x - m, right: x + w + m, top: y - m, bottom: y + h + m };
}

// Visible part of the sheet when a viewer scales it to COVER a frame of the given width:height ratio ("Fill page").
function visibleAfterFill(sheet, frameRatio) {
  const imgRatio = sheet.w / sheet.h;
  if (frameRatio < imgRatio) { // frame is narrower: sides are cropped
    const vw = sheet.h * frameRatio;
    return { left: (sheet.w - vw) / 2, right: (sheet.w + vw) / 2, top: 0, bottom: sheet.h };
  }
  const vh = sheet.w / frameRatio; // frame is wider: top and bottom are cropped
  return { left: 0, right: sheet.w, top: (sheet.h - vh) / 2, bottom: (sheet.h + vh) / 2 };
}

const LANDSCAPE_FRAMES = {
  'A4 landscape (11.69 x 8.27 in)': 297 / 210,
  'Letter landscape (11 x 8.5 in)': 11 / 8.5,
  '5 x 7 in photo': 7 / 5,
  '4 x 6 in photo': 6 / 4,
  '3.5 x 5 in photo': 5 / 3.5,
  '8 x 10 in photo': 10 / 8,
  '11 x 14 in photo': 14 / 11
};
const PORTRAIT_FRAMES = {
  'A4 portrait': 210 / 297,
  'Letter portrait': 8.5 / 11,
  '4 x 6 in photo': 4 / 6,
  '5 x 7 in photo': 5 / 7,
  '8 x 10 in photo': 8 / 10
};

test('landscape sheet has the shape of A4 landscape and almost exactly a 5 x 7 in photo', () => {
  const s = R.SHEETS.landscape;
  assert.deepStrictEqual([s.w, s.h], [2339, 1654]);
  assert.ok(Math.abs(s.w / s.h - 297 / 210) < 0.002, 'matches A4');
  assert.ok(Math.abs(s.w / s.h - 7 / 5) / (7 / 5) < 0.011, 'within 1.1% of 5x7');
});

for (const [name, ratio] of Object.entries(LANDSCAPE_FRAMES)) {
  test('landscape sheet: "Fill page" in a ' + name + ' frame keeps the whole ticket visible', () => {
    const b = ticketBox('landscape');
    const v = visibleAfterFill(b.s, ratio);
    assert.ok(b.left >= v.left && b.right <= v.right && b.top >= v.top && b.bottom <= v.bottom,
      'ticket box ' + JSON.stringify([b.left, b.right, b.top, b.bottom]) + ' vs visible ' + JSON.stringify(v));
  });
}

for (const [name, ratio] of Object.entries(PORTRAIT_FRAMES)) {
  test('portrait page: "Fill page" in a ' + name + ' frame keeps the whole ticket visible', () => {
    const b = ticketBox('portrait');
    const v = visibleAfterFill(b.s, ratio);
    assert.ok(b.left >= v.left && b.right <= v.right && b.top >= v.top && b.bottom <= v.bottom,
      'ticket box ' + JSON.stringify([b.left, b.right, b.top, b.bottom]) + ' vs visible ' + JSON.stringify(v));
  });
}

test('the previously cropped case: a ticket-only image in a 5 x 7 in "Fill page" frame loses its sides', () => {
  const ticket = { w: 1640, h: 784 };
  const v = visibleAfterFill(ticket, 7 / 5);
  const keptShare = (v.right - v.left) / ticket.w;
  assert.ok(keptShare < 0.7, 'only ' + Math.round(keptShare * 100) + '% of the width stays visible');
});

test('sheet margins are comfortable (at least 20 mm at A4 landscape)', () => {
  const b = ticketBox('landscape');
  const mm = (px) => px / R.SHEET_DPI * 25.4;
  assert.ok(mm(b.left) >= 20, 'side margin ' + mm(b.left) + ' mm');
  assert.ok(mm(b.top) >= 20, 'top margin ' + mm(b.top) + ' mm');
});
