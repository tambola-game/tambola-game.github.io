const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const Png = require('../js/png.js');

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(Png.crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function makePng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function chunks(buf) {
  const out = []; let pos = 8;
  while (pos < buf.length) { const len = buf.readUInt32BE(pos); out.push({ type: buf.toString('ascii', pos + 4, pos + 8), len, crc: buf.readUInt32BE(pos + 8 + len), data: buf.subarray(pos + 8, pos + 8 + len) }); pos += 12 + len; }
  return out;
}

test('crc32 matches the standard check value', () => {
  assert.strictEqual(Png.crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('setDpi inserts a valid pHYs chunk right after IHDR and keeps every other chunk', () => {
  const src = makePng();
  const out = Buffer.from(Png.setDpi(new Uint8Array(src), 200));
  const c = chunks(out);
  assert.deepStrictEqual(c.map((x) => x.type), ['IHDR', 'pHYs', 'IDAT', 'IEND']);
  const p = c[1];
  const ppm = Math.round(200 / 0.0254);
  assert.strictEqual(p.len, 9);
  assert.strictEqual(p.data.readUInt32BE(0), ppm);
  assert.strictEqual(p.data.readUInt32BE(4), ppm);
  assert.strictEqual(p.data[8], 1);
  assert.strictEqual(p.crc, Png.crc32(Buffer.concat([Buffer.from('pHYs'), p.data])));
  assert.strictEqual(ppm, 7874);
  chunks(src).forEach((orig) => assert.ok(c.find((x) => x.type === orig.type).data.equals(orig.data), orig.type + ' unchanged'));
});

test('setDpi replaces an existing pHYs chunk instead of duplicating it', () => {
  const twice = Buffer.from(Png.setDpi(Png.setDpi(new Uint8Array(makePng()), 96), 300));
  const c = chunks(twice);
  assert.strictEqual(c.filter((x) => x.type === 'pHYs').length, 1);
  assert.strictEqual(c.find((x) => x.type === 'pHYs').data.readUInt32BE(0), Math.round(300 / 0.0254));
});

test('setDpi rejects data that is not a PNG', () => {
  assert.throws(() => Png.setDpi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), 200), /Not a PNG/);
});

test('A4 page at 200 dpi is 1654 x 2339 px and the ticket on it keeps at least 8 mm margins', () => {
  const pageW = Math.round(210 / 25.4 * 200), pageH = Math.round(297 / 25.4 * 200);
  assert.deepStrictEqual([pageW, pageH], [1654, 2339]);
  const mm = (px) => px / 200 * 25.4;
  assert.ok(mm(820 * 1.8) < 210 - 16, 'ticket width ' + mm(820 * 1.8) + ' mm');
  assert.ok(mm(392 * 1.8) < 297 - 16);
});
