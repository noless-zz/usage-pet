// Generates build/icon.png (app icon) and build/preview.png (all moods side by side).
// Run: node scripts/make-assets.js
const fs = require('fs');
const path = require('path');
const { drawPet, MOODS } = require('../src/sprite');
const { encodePNG, blit } = require('./png');

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });

// 256x256 icon: 24px sprite * 10 = 240, centered
{
  const size = 256;
  const rgba = Buffer.alloc(size * size * 4);
  blit(rgba, size, drawPet('happy'), 8, 8, 10);
  fs.writeFileSync(path.join(outDir, 'icon.png'), encodePNG(size, size, rgba));
}

// Preview sheet on a light background
{
  const scale = 6;
  const cell = 24 * scale + 20;
  const width = cell * MOODS.length;
  const height = cell;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 245;
    rgba[i + 1] = 243;
    rgba[i + 2] = 238;
    rgba[i + 3] = 255;
  }
  MOODS.forEach((m, i) => blit(rgba, width, drawPet(m), i * cell + 10, 10, scale));
  fs.writeFileSync(path.join(outDir, 'preview.png'), encodePNG(width, height, rgba));
}
console.log('wrote build/icon.png and build/preview.png');
