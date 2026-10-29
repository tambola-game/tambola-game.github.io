/* Random number sources: crypto-backed (default) or seeded (deterministic). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TambolaRng = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function cryptoRng() {
    const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.getRandomValues) return Math.random;
    const buf = new Uint32Array(1);
    return function () {
      c.getRandomValues(buf);
      return buf[0] / 4294967296;
    };
  }

  // xmur3 string hash -> 32-bit seeds
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }

  // sfc32 PRNG
  function seededRng(seed) {
    const next = hashSeed(String(seed));
    let a = next(), b = next(), c = next(), d = next();
    const rng = function () {
      a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    };
    for (let i = 0; i < 15; i++) rng();
    return rng;
  }

  function randomSeed() {
    const r = cryptoRng();
    return Math.floor(r() * 4294967296).toString(36) + Math.floor(r() * 4294967296).toString(36);
  }

  function randInt(rng, n) {
    return Math.floor(rng() * n);
  }

  return { cryptoRng, seededRng, randomSeed, randInt };
});
