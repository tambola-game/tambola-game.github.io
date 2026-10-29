/* Writes a physical print resolution (pHYs chunk) into PNG bytes so image viewers print at a sensible size. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TambolaPng = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  let table = null;

  function crc32(bytes) {
    if (!table) {
      table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // Returns a new Uint8Array: the PNG with a pHYs chunk (pixels per metre from `dpi`) right after IHDR.
  // Any existing pHYs chunk is replaced. Throws if `bytes` is not a PNG.
  function setDpi(bytes, dpi) {
    for (let i = 0; i < SIGNATURE.length; i++) if (bytes[i] !== SIGNATURE[i]) throw new Error('Not a PNG file');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ppm = Math.round(dpi / 0.0254);

    const chunk = new Uint8Array(21); // length(4) + type(4) + data(9) + crc(4)
    const cv = new DataView(chunk.buffer);
    cv.setUint32(0, 9);
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
    cv.setUint32(8, ppm);
    cv.setUint32(12, ppm);
    chunk[16] = 1; // unit: metre
    cv.setUint32(17, crc32(chunk.subarray(4, 17)));

    const parts = [bytes.subarray(0, 8)];
    let pos = 8, inserted = false;
    while (pos + 12 <= bytes.length) {
      const len = view.getUint32(pos);
      const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
      const end = pos + 12 + len;
      if (type !== 'pHYs') parts.push(bytes.subarray(pos, end));
      if (type === 'IHDR' && !inserted) { parts.push(chunk); inserted = true; }
      pos = end;
    }
    if (!inserted) throw new Error('PNG has no IHDR chunk');
    const out = new Uint8Array(parts.reduce(function (s, p) { return s + p.length; }, 0));
    let o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  return { setDpi, crc32 };
});
