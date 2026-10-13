// Pixel pets. Each species is a body shape + a bit of head decoration; the face
// (eyes, mouth, cheeks, sweat) is shared so every pet shows the same moods.
//
// drawPet(mood, opts) returns { w, h, pixels } — a 24x24 grid of CSS colors (null = transparent).
//   opts.species  one of SPECIES ids (default 'sprout')
//   opts.custom   array of 576 colors/nulls made from a user image (overrides species)
//   opts.blink, opts.squash  animation state
// Works both in the renderer (window.PetSprite) and in Node (require).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PetSprite = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 24;
  const H = 24;
  const MOODS = ['happy', 'ok', 'tired', 'exhausted', 'asleep', 'confused', 'login'];

  const EYE = '#24302b';
  const SHINE = '#ffffff';
  const CHEEK = '#f4a3a8';
  const SWEAT = '#8fd3ff';

  // ---------- color helpers ----------
  function hex2rgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(r, g, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }
  function mix(a, b, t) {
    const x = hex2rgb(a);
    const y = hex2rgb(b);
    return rgb2hex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }

  // How far each mood pulls a pet's colors toward a washed-out tone.
  const MOOD_TINT = {
    happy: null,
    ok: null,
    tired: ['#b4bcb8', 0.3],
    exhausted: ['#b4bdb7', 0.55],
    asleep: ['#9fb4cc', 0.5],
    confused: ['#c7c3d9', 0.55],
    login: ['#c7c3d9', 0.55],
  };
  function tint(color, mood) {
    const t = MOOD_TINT[mood];
    return t ? mix(color, t[0], t[1]) : color;
  }

  // ---------- species ----------
  // shape: ellipse centre/radii and exponent n (2 = ellipse, 4 = rounded box).
  // art: ASCII masks stamped relative to the top of the head. L=line B=body P=accent A=accent2 .=none
  const SPECIES = {
    sprout: {
      label: 'Sprout',
      colors: { body: '#7fd8b2', belly: '#c9f2df', line: '#2f7a5e' },
      shape: { cx: 12, cy: 15.5, rx: 9, ry: 7.5, n: 2 },
    },
    cat: {
      label: 'Cat',
      colors: { body: '#f2b66d', belly: '#fde6c4', line: '#8a5a24', acc: '#f4a3a8' },
      shape: { cx: 12, cy: 15.5, rx: 9, ry: 7.5, n: 2 },
    },
    bunny: {
      label: 'Bunny',
      colors: { body: '#f1ecf5', belly: '#ffffff', line: '#7b6f8a', acc: '#f4a3c0' },
      shape: { cx: 12, cy: 16, rx: 8.5, ry: 7, n: 2 },
    },
    bear: {
      label: 'Bear',
      colors: { body: '#b98a62', belly: '#e6cba9', line: '#5e3f27', acc: '#e6cba9' },
      shape: { cx: 12, cy: 15.5, rx: 9, ry: 7.5, n: 2 },
    },
    robot: {
      label: 'Robot',
      colors: { body: '#9db8d6', belly: '#dbe8f5', line: '#3d5670', acc: '#e25555' },
      shape: { cx: 12, cy: 15.5, rx: 9.5, ry: 7.5, n: 4 },
    },
    ghost: {
      label: 'Ghost',
      colors: { body: '#eef0fb', belly: '#ffffff', line: '#6a6f9a' },
      shape: { cx: 12, cy: 13.5, rx: 8.5, ry: 9.5, n: 2.4 },
    },
  };
  const SPECIES_LIST = Object.keys(SPECIES).map((id) => ({ id, label: SPECIES[id].label }));

  const SPROUT_PALETTES = {
    happy: { leaf: '#4cbf5a', leafDark: '#2f8a3c' },
    ok: { leaf: '#5cb85c', leafDark: '#3a8a3c' },
    tired: { leaf: '#a9b84a', leafDark: '#7a8a2e' },
    exhausted: { leaf: '#c9a24a', leafDark: '#8f6e2a' },
    asleep: { leaf: '#b08a4a', leafDark: '#7a5c2a' },
    login: { leaf: '#8fae8f', leafDark: '#5f7f5f' },
    confused: { leaf: '#8fae8f', leafDark: '#5f7f5f' },
  };

  function palette(id, mood) {
    const c = SPECIES[id].colors;
    const p = {
      body: tint(c.body, mood),
      belly: tint(c.belly, mood),
      line: tint(c.line, mood),
      acc: c.acc ? tint(c.acc, mood) : null,
    };
    if (id === 'sprout') Object.assign(p, SPROUT_PALETTES[mood] || SPROUT_PALETTES.ok);
    return p;
  }

  // ---------- grid helpers ----------
  function grid() {
    const g = new Array(W * H).fill(null);
    g.set = (x, y, c) => {
      if (x >= 0 && x < W && y >= 0 && y < H) g[y * W + x] = c;
    };
    return g;
  }

  function inShape(x, y, s) {
    const dx = Math.abs(x + 0.5 - s.cx) / s.rx;
    const dy = Math.abs(y + 0.5 - s.cy) / s.ry;
    return Math.pow(dx, s.n) + Math.pow(dy, s.n) <= 1;
  }

  function stamp(g, rows, x0, y0, map) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = map[row[i]];
        if (c) g.set(x0 + i, y0 + j, c);
      }
    });
  }
  const mirror = (rows) => rows.map((r) => r.split('').reverse().join(''));

  // ---------- head decorations ----------
  function decorate(id, g, p, mood, top, squash) {
    const map = { L: p.line, B: p.body, P: p.acc, A: p.leafDark };
    const sag = mood === 'exhausted' || mood === 'asleep' ? 2 : mood === 'tired' ? 1 : 0;

    if (id === 'sprout') {
      const stemTop = sag === 2 ? top - 3 : top - 4;
      for (let y = stemTop; y < top; y++) g.set(12, y, p.leafDark);
      const sy = stemTop;
      const leaf = (pts) => pts.forEach(([x, y, dark]) => g.set(x, y, dark ? p.leafDark : p.leaf));
      if (sag === 0) {
        leaf([[11, sy], [10, sy - 1], [9, sy - 1], [10, sy - 2], [8, sy - 2, 1], [9, sy - 2]]);
        leaf([[13, sy], [14, sy - 1], [15, sy - 1], [14, sy - 2], [16, sy - 2, 1], [15, sy - 2]]);
      } else if (sag === 1) {
        leaf([[11, sy], [10, sy], [9, sy], [10, sy - 1], [8, sy + 1, 1]]);
        leaf([[13, sy], [14, sy], [15, sy], [14, sy - 1], [16, sy + 1, 1]]);
      } else {
        leaf([[11, sy], [10, sy], [9, sy + 1], [8, sy + 2, 1]]);
        leaf([[13, sy], [14, sy], [15, sy + 1], [16, sy + 2, 1]]);
      }
    } else if (id === 'cat') {
      const ear = ['L...', 'LL..', 'LPL.', 'LPBL', 'LBBB'];
      const flat = ['....', '.LL.', 'LPPL', 'LBBB'];
      const rows = sag === 0 ? ear : flat;
      const y0 = top + 1 - rows.length + (sag === 0 ? 0 : 1);
      stamp(g, rows, 5, y0, map);
      stamp(g, mirror(rows), 15, y0, map);
    } else if (id === 'bunny') {
      const up = ['.LL.', 'LBBL', 'LPBL', 'LPBL', 'LPBL', 'LPBL', 'LBBL', 'LBBB'];
      const mid = ['.LL.....', 'LBBL....', 'LPBBL...', 'LPBBBL..', '.LBBBBL.', '..LBBBBL', '....LBBB'];
      const down = ['........', '.LLLL...', 'LBBBBL..', 'LPPPBBLL', '.LLLLBBB'];
      if (sag === 0) {
        stamp(g, up, 6, top + 1 - up.length, map);
        stamp(g, mirror(up), 14, top + 1 - up.length, map);
      } else if (sag === 1) {
        stamp(g, mid, 4, top + 1 - mid.length, map);
        stamp(g, mirror(mid), 12, top + 1 - mid.length, map);
      } else {
        stamp(g, down, 2, top + 1, map);
        stamp(g, mirror(down), 14, top + 1, map);
      }
    } else if (id === 'bear') {
      const ear = ['.LL.', 'LBBL', 'LPPL', 'LBBB'];
      stamp(g, ear, 4, top - 1, map);
      stamp(g, mirror(ear), 16, top - 1, map);
    } else if (id === 'robot') {
      const glow = { happy: '#6be07a', ok: '#6be07a', tired: '#f0d24a', exhausted: '#f08a3a', asleep: '#6b7380', confused: '#a0a0b0', login: '#a0a0b0' }[mood];
      for (let y = top - 3; y < top; y++) g.set(12, y, p.line);
      g.set(11, top - 5, p.line);
      g.set(12, top - 5, p.line);
      g.set(13, top - 5, p.line);
      g.set(11, top - 4, glow);
      g.set(12, top - 4, glow);
      g.set(13, top - 4, glow);
      g.set(12, top - 6, p.line);
      // side bolts
      g.set(1, top + 7, p.line);
      g.set(22, top + 7, p.line);
    } else if (id === 'ghost') {
      g.set(12, top - 1, p.line);
      g.set(13, top - 1, p.line);
      g.set(14, top - 2, p.line);
      g.set(15, top - 2, p.line);
    }
  }

  function drawFeet(id, g, p, s) {
    if (id === 'ghost') {
      // wavy hem instead of feet
      // notch the bottom edge into scallops
      const bottom = Math.floor(s.cy + s.ry);
      for (let x = 2; x <= 21; x++) {
        if (Math.floor((x - 2) / 3) % 2 !== 1) continue;
        g.set(x, bottom, null);
        g.set(x, bottom - 1, null);
        if (g[(bottom - 2) * W + x]) g.set(x, bottom - 2, p.line);
      }
      return;
    }
    const y = Math.min(23, Math.floor(s.cy + s.ry));
    for (const fx of [7, 8, 15, 16]) g.set(fx, y, p.line);
  }

  // ---------- species pets ----------
  function drawSpecies(id, mood, opts) {
    const sp = SPECIES[id] || SPECIES.sprout;
    id = SPECIES[id] ? id : 'sprout';
    const p = palette(id, mood);
    const g = grid();
    const squash = opts.squash ? 1 : 0;
    const s = { ...sp.shape, cy: sp.shape.cy + squash * 0.5, rx: sp.shape.rx + squash * 0.5, ry: sp.shape.ry - squash * 0.5 };

    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!inShape(x, y, s)) continue;
        const edge = !inShape(x - 1, y, s) || !inShape(x + 1, y, s) || !inShape(x, y - 1, s) || !inShape(x, y + 1, s);
        g.set(x, y, edge ? p.line : p.body);
      }
    // belly
    const belly = { cx: 12, cy: s.cy + 3.5, rx: 5, ry: 3.2, n: 2 };
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (inShape(x, y, belly) && g[y * W + x] === p.body) g.set(x, y, p.belly);

    drawFeet(id, g, p, s);

    // face
    const eyeY = 13 + squash;
    const closed = opts.blink || mood === 'asleep';
    for (const ex of [8, 15]) {
      if (mood === 'happy' && !opts.blink) {
        g.set(ex - 1, eyeY + 1, EYE);
        g.set(ex, eyeY, EYE);
        g.set(ex + 1, eyeY + 1, EYE);
      } else if (closed) {
        g.set(ex - 1, eyeY + 1, EYE);
        g.set(ex, eyeY + 1, EYE);
        g.set(ex + 1, eyeY + 1, EYE);
      } else if (mood === 'tired' || mood === 'exhausted') {
        g.set(ex - 1, eyeY, p.line);
        g.set(ex, eyeY, p.line);
        g.set(ex + 1, eyeY, p.line);
        g.set(ex, eyeY + 1, EYE);
        g.set(ex + 1, eyeY + 1, EYE);
      } else if (mood === 'confused' || mood === 'login') {
        g.set(ex, eyeY, EYE);
        g.set(ex, eyeY + 1, EYE);
      } else {
        g.set(ex, eyeY, EYE);
        g.set(ex + 1, eyeY, EYE);
        g.set(ex, eyeY + 1, EYE);
        g.set(ex + 1, eyeY + 1, EYE);
        g.set(ex, eyeY, SHINE);
      }
    }
    if (mood === 'happy' || mood === 'ok') {
      for (const cx of [5, 6, 17, 18]) g.set(cx, eyeY + 3, CHEEK);
    }
    const my = 17 + squash;
    const mouth = {
      happy: [[10, my - 1], [11, my], [12, my], [13, my - 1]],
      ok: [[11, my], [12, my]],
      tired: [[11, my], [12, my], [13, my - 1]],
      exhausted: [[10, my], [11, my - 1], [12, my], [13, my - 1]],
      asleep: [[12, my]],
    }[mood] || [[11, my], [12, my], [13, my]];
    mouth.forEach(([x, y]) => g.set(x, y, EYE));
    if (mood === 'tired' || mood === 'exhausted') {
      [[19, 9], [19, 10], [20, 10], [19, 11]].forEach(([x, y]) => g.set(x, y, SWEAT));
    }
    // cat whiskers
    if (id === 'cat') {
      for (const [x, y] of [[2, eyeY + 2], [3, eyeY + 2], [2, eyeY + 4], [3, eyeY + 3], [20, eyeY + 2], [21, eyeY + 2], [21, eyeY + 4], [20, eyeY + 3]])
        g.set(x, y, p.line);
    }

    decorate(id, g, p, mood, Math.round(s.cy - s.ry), squash);
    return { w: W, h: H, pixels: g.slice(0, W * H) };
  }

  // ---------- pet made from the user's image ----------
  // Same mood idea without a face: colors wash out as usage climbs, plus a sweat drop.
  function drawCustom(pixels, mood, opts) {
    const g = grid();
    for (let i = 0; i < W * H; i++) g[i] = pixels[i] ? tint(pixels[i], mood) : null;
    if (mood === 'tired' || mood === 'exhausted') {
      [[20, 3], [20, 4], [21, 4], [20, 5]].forEach(([x, y]) => g.set(x, y, SWEAT));
    }
    if (opts.squash) {
      // squash: drop everything one row (feet stay planted by clamping the bottom row)
      const out = grid();
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const c = g[y * W + x];
          if (c) out.set(x, Math.min(H - 1, y + 1), c);
        }
      return { w: W, h: H, pixels: out.slice(0, W * H) };
    }
    return { w: W, h: H, pixels: g.slice(0, W * H) };
  }

  function drawPet(mood, opts = {}) {
    if (opts.custom && opts.custom.length === W * H) return drawCustom(opts.custom, mood, opts);
    return drawSpecies(opts.species || 'sprout', mood, opts);
  }

  return { drawPet, MOODS, SPECIES: SPECIES_LIST, W, H };
});
