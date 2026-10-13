// "Sprout" — an original pixel critter with a little plant on its head.
// The plant wilts and the critter gets sleepier as your Claude usage climbs.
//
// drawPet(mood, opts) returns a 24x24 grid of CSS colors (or null for transparent).
// Works both in the renderer (window.PetSprite) and in Node (require), so the same
// art is used for the on-screen pet, the app icon and the preview sheet.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PetSprite = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 24;
  const H = 24;

  const PALETTES = {
    happy: { body: '#7fd8b2', belly: '#c9f2df', line: '#2f7a5e', leaf: '#4cbf5a', leafDark: '#2f8a3c' },
    ok: { body: '#7fd8b2', belly: '#c9f2df', line: '#2f7a5e', leaf: '#5cb85c', leafDark: '#3a8a3c' },
    tired: { body: '#a4ccb6', belly: '#d8ece1', line: '#4f6f5f', leaf: '#a9b84a', leafDark: '#7a8a2e' },
    exhausted: { body: '#b4bdb7', belly: '#dfe4e0', line: '#5c6660', leaf: '#c9a24a', leafDark: '#8f6e2a' },
    asleep: { body: '#9fb4cc', belly: '#d3dfec', line: '#46586e', leaf: '#b08a4a', leafDark: '#7a5c2a' },
    login: { body: '#c7c3d9', belly: '#e6e3f0', line: '#5d5873', leaf: '#8fae8f', leafDark: '#5f7f5f' },
    confused: { body: '#c7c3d9', belly: '#e6e3f0', line: '#5d5873', leaf: '#8fae8f', leafDark: '#5f7f5f' },
  };
  const EYE = '#24302b';
  const SHINE = '#ffffff';
  const CHEEK = '#f4a3a8';
  const SWEAT = '#8fd3ff';

  function grid() {
    const g = new Array(W * H).fill(null);
    g.set = (x, y, c) => {
      if (x >= 0 && x < W && y >= 0 && y < H) g[y * W + x] = c;
    };
    return g;
  }

  function inEllipse(x, y, cx, cy, rx, ry) {
    const dx = (x + 0.5 - cx) / rx;
    const dy = (y + 0.5 - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  // opts: { blink: bool, squash: 0|1 }
  function drawPet(mood, opts = {}) {
    const p = PALETTES[mood] || PALETTES.ok;
    const g = grid();
    const squash = opts.squash ? 1 : 0;
    const cx = 12;
    const cy = 15.5 + squash * 0.5;
    const rx = 9 + squash * 0.5;
    const ry = 7.5 - squash * 0.5;

    // body fill + outline
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inEllipse(x, y, cx, cy, rx, ry)) continue;
        const edge =
          !inEllipse(x - 1, y, cx, cy, rx, ry) ||
          !inEllipse(x + 1, y, cx, cy, rx, ry) ||
          !inEllipse(x, y - 1, cx, cy, rx, ry) ||
          !inEllipse(x, y + 1, cx, cy, rx, ry);
        g.set(x, y, edge ? p.line : p.body);
      }
    }
    // belly
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (inEllipse(x, y, 12, 19 + squash * 0.5, 5, 3.2) && g[y * W + x] === p.body) g.set(x, y, p.belly);

    // feet
    for (const fx of [7, 8, 15, 16]) g.set(fx, 23, p.line);

    // eyes
    const eyeY = 13 + squash;
    const eyes = [8, 15];
    const closed = opts.blink || mood === 'asleep';
    for (const ex of eyes) {
      if (mood === 'happy' && !opts.blink) {
        // ^ ^ happy eyes
        g.set(ex - 1, eyeY + 1, EYE);
        g.set(ex, eyeY, EYE);
        g.set(ex + 1, eyeY + 1, EYE);
      } else if (closed) {
        g.set(ex - 1, eyeY + 1, EYE);
        g.set(ex, eyeY + 1, EYE);
        g.set(ex + 1, eyeY + 1, EYE);
      } else if (mood === 'tired' || mood === 'exhausted') {
        // heavy lids: top row is body-colored line, eye below
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

    // cheeks
    if (mood === 'happy' || mood === 'ok') {
      g.set(5, eyeY + 3, CHEEK);
      g.set(6, eyeY + 3, CHEEK);
      g.set(17, eyeY + 3, CHEEK);
      g.set(18, eyeY + 3, CHEEK);
    }

    // mouth
    const my = 17 + squash;
    if (mood === 'happy') {
      g.set(10, my - 1, EYE);
      g.set(11, my, EYE);
      g.set(12, my, EYE);
      g.set(13, my - 1, EYE);
    } else if (mood === 'ok') {
      g.set(11, my, EYE);
      g.set(12, my, EYE);
    } else if (mood === 'tired') {
      g.set(11, my, EYE);
      g.set(12, my, EYE);
      g.set(13, my - 1, EYE);
    } else if (mood === 'exhausted') {
      g.set(10, my, EYE);
      g.set(11, my - 1, EYE);
      g.set(12, my, EYE);
      g.set(13, my - 1, EYE);
    } else if (mood === 'asleep') {
      g.set(12, my, EYE);
    } else {
      g.set(11, my, EYE);
      g.set(12, my, EYE);
      g.set(13, my, EYE);
    }

    // sweat drop
    if (mood === 'tired' || mood === 'exhausted') {
      g.set(19, 9, SWEAT);
      g.set(19, 10, SWEAT);
      g.set(20, 10, SWEAT);
      g.set(19, 11, SWEAT);
    }

    // sprout: stem + two leaves; leaves droop with fatigue
    const top = 8 + squash; // top of head
    const stemTop = mood === 'exhausted' || mood === 'asleep' ? top - 3 : top - 4;
    for (let y = stemTop; y < top; y++) g.set(12, y, p.leafDark);
    const sy = stemTop;
    const leaf = (pts) => pts.forEach(([x, y, dark]) => g.set(x, y, dark ? p.leafDark : p.leaf));
    if (mood === 'happy' || mood === 'ok' || mood === 'login' || mood === 'confused') {
      // perky leaves pointing up and out
      leaf([[11, sy], [10, sy - 1], [9, sy - 1], [10, sy - 2], [8, sy - 2, 1], [9, sy - 2]]);
      leaf([[13, sy], [14, sy - 1], [15, sy - 1], [14, sy - 2], [16, sy - 2, 1], [15, sy - 2]]);
    } else if (mood === 'tired') {
      // leaves level, starting to sag
      leaf([[11, sy], [10, sy], [9, sy], [10, sy - 1], [8, sy + 1, 1]]);
      leaf([[13, sy], [14, sy], [15, sy], [14, sy - 1], [16, sy + 1, 1]]);
    } else {
      // wilted, hanging down
      leaf([[11, sy], [10, sy], [9, sy + 1], [8, sy + 2, 1]]);
      leaf([[13, sy], [14, sy], [15, sy + 1], [16, sy + 2, 1]]);
    }
    return { w: W, h: H, pixels: g.slice(0, W * H) };
  }

  const MOODS = ['happy', 'ok', 'tired', 'exhausted', 'asleep', 'confused', 'login'];
  return { drawPet, MOODS, W, H };
});
