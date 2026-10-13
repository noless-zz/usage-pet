const test = require('node:test');
const assert = require('node:assert');
const { drawPet, MOODS, SPECIES } = require('../src/sprite');
const { buildCustomPet } = require('../src/pixelize');

test('every species draws every mood inside the grid', () => {
  for (const s of SPECIES)
    for (const m of MOODS)
      for (const squash of [0, 1]) {
        const r = drawPet(m, { species: s.id, squash });
        assert.strictEqual(r.pixels.length, 576);
        assert.ok(r.pixels.filter(Boolean).length > 100, `${s.id}/${m} has a body`);
      }
});

test('unknown species falls back to sprout', () => {
  assert.deepStrictEqual(drawPet('ok', { species: 'nope' }).pixels, drawPet('ok', { species: 'sprout' }).pixels);
});

// 40x40 red disc on a white background
function disc(withAlpha) {
  const w = 40, h = 40;
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = Math.hypot(x - 20, y - 20) < 12;
      px.set(inside ? [220, 40, 40, 255] : withAlpha ? [0, 0, 0, 0] : [255, 255, 255, 255], i);
    }
  return { px, w, h };
}

test('image pet: white background is removed, subject outlined and on the floor', () => {
  for (const alpha of [false, true]) {
    const { px, w, h } = disc(alpha);
    const pet = buildCustomPet(px, w, h);
    assert.strictEqual(pet.length, 576);
    assert.strictEqual(pet[0], null); // corner is empty
    assert.ok(pet.includes('#2b2b3a'), 'has outline');
    assert.ok(pet.filter((c) => c && c !== '#2b2b3a').length > 200, 'has subject pixels');
    const bottomRow = pet.slice(23 * 24).filter(Boolean);
    assert.ok(bottomRow.length > 0); // outline row rests on the floor
  }
});

test('image pet: custom pet tints with mood and keeps its shape', () => {
  const { px, w, h } = disc(true);
  const custom = buildCustomPet(px, w, h);
  const happy = drawPet('happy', { custom }).pixels;
  const asleep = drawPet('asleep', { custom }).pixels;
  assert.deepStrictEqual(happy.map(Boolean), asleep.map(Boolean));
  assert.notDeepStrictEqual(happy, asleep);
});

test('blank image gives an empty pet, not a crash', () => {
  const px = Buffer.alloc(8 * 8 * 4);
  assert.ok(buildCustomPet(px, 8, 8).every((c) => c === null));
});
