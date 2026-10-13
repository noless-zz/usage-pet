// Turns an ordinary picture into a 24x24 pixel-art pet (pure JS, no Electron — unit-tested).
//
// buildCustomPet(rgba, w, h) -> array of 576 '#rrggbb' strings / null (transparent)
//   rgba: RGBA bytes of the picture (any size; main.js pre-shrinks big photos).
// Steps: remove a plain background (alpha, or flood-fill from the border) -> crop to the
// subject -> area-average down to fit 22x22 -> posterize -> add a dark outline -> sit it on the floor.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PetPixelize = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SIZE = 24;
  const INNER = 22; // subject box; the outline adds a pixel around it
  const OUTLINE = '#2b2b3a';

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  function removeBackground(rgba, w, h) {
    const alpha = new Uint8Array(w * h);
    let hasAlpha = false;
    for (let i = 0; i < w * h; i++) {
      alpha[i] = rgba[i * 4 + 3];
      if (alpha[i] < 250) hasAlpha = true;
    }
    if (hasAlpha) return alpha; // already cut out

    // Background = the colour the border mostly has. Flood-fill inwards from the border.
    const px = (x, y) => [rgba[(y * w + x) * 4], rgba[(y * w + x) * 4 + 1], rgba[(y * w + x) * 4 + 2]];
    const border = [];
    for (let x = 0; x < w; x++) border.push(px(x, 0), px(x, h - 1));
    for (let y = 0; y < h; y++) border.push(px(0, y), px(w - 1, y));
    // dominant border colour: the one that most other border pixels are close to
    let bg = border[0];
    let best = -1;
    for (const c of border) {
      let n = 0;
      for (const d of border) if (dist(c, d) < 40) n++;
      if (n > best) {
        best = n;
        bg = c;
      }
    }
    if (best < border.length * 0.5) return alpha; // busy background: keep the whole picture

    const TOL = 48;
    const seen = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (seen[i] || dist(px(x, y), bg) > TOL) return;
      seen[i] = 1;
      stack.push(i);
    };
    for (let x = 0; x < w; x++) {
      push(x, 0);
      push(x, h - 1);
    }
    for (let y = 0; y < h; y++) {
      push(0, y);
      push(w - 1, y);
    }
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      const y = (i / w) | 0;
      alpha[i] = 0;
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }
    return alpha;
  }

  const hex = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  const posterize = (v) => Math.min(255, Math.round(v / 40) * 40);

  function buildCustomPet(rgba, w, h) {
    const alpha = removeBackground(rgba, w, h);

    // bounding box of the subject
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (alpha[y * w + x] > 127) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) return new Array(SIZE * SIZE).fill(null);
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;

    // fit the subject inside INNER x INNER, keeping its proportions
    const k = Math.min(INNER / bw, INNER / bh);
    const tw = Math.max(1, Math.round(bw * k));
    const th = Math.max(1, Math.round(bh * k));

    const small = new Array(tw * th).fill(null);
    for (let ty = 0; ty < th; ty++)
      for (let tx = 0; tx < tw; tx++) {
        const sx0 = x0 + (tx * bw) / tw;
        const sx1 = x0 + ((tx + 1) * bw) / tw;
        const sy0 = y0 + (ty * bh) / th;
        const sy1 = y0 + ((ty + 1) * bh) / th;
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let y = Math.floor(sy0); y < Math.max(Math.ceil(sy1), Math.floor(sy0) + 1); y++)
          for (let x = Math.floor(sx0); x < Math.max(Math.ceil(sx1), Math.floor(sx0) + 1); x++) {
            if (x >= w || y >= h) continue;
            const i = y * w + x;
            n++;
            if (alpha[i] <= 127) continue;
            a++;
            r += rgba[i * 4];
            g += rgba[i * 4 + 1];
            b += rgba[i * 4 + 2];
          }
        if (n && a / n >= 0.5) small[ty * tw + tx] = [r / a, g / a, b / a];
      }

    // place on the 24x24 floor, centred, with room for the outline
    const out = new Array(SIZE * SIZE).fill(null);
    const ox = Math.floor((SIZE - tw) / 2);
    const oy = SIZE - 1 - th;
    for (let ty = 0; ty < th; ty++)
      for (let tx = 0; tx < tw; tx++) {
        const c = small[ty * tw + tx];
        if (c) out[(oy + ty) * SIZE + ox + tx] = '#' + hex(posterize(c[0])) + hex(posterize(c[1])) + hex(posterize(c[2]));
      }

    // outline
    const solid = out.map((c) => !!c);
    for (let y = 0; y < SIZE; y++)
      for (let x = 0; x < SIZE; x++) {
        if (solid[y * SIZE + x]) continue;
        const n =
          (x > 0 && solid[y * SIZE + x - 1]) ||
          (x < SIZE - 1 && solid[y * SIZE + x + 1]) ||
          (y > 0 && solid[(y - 1) * SIZE + x]) ||
          (y < SIZE - 1 && solid[(y + 1) * SIZE + x]);
        if (n) out[y * SIZE + x] = OUTLINE;
      }
    return out;
  }

  return { buildCustomPet, SIZE };
});
