// Site icons. The artwork — one heart on a cherry tile — lives in
// scripts/icon-art.mjs and every file in public/ is generated from it, so this
// test guards against the committed icons drifting away from the drawing.
//
// Run `npm run icons` after changing the artwork.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toSVG, iconShapes, GRID } from '../scripts/icon-art.mjs';
import { rasterise } from '../scripts/make-icons.mjs';

const read = file => readFileSync(new URL(`../public/${file}`, import.meta.url));

// --- the vectors match the artwork ------------------------------------------
assert.equal(read('favicon.svg').toString(), toSVG('app', { title: 'Our Little Arcade' }), 'favicon.svg is stale — run npm run icons');
assert.equal(read('mask-icon.svg').toString(), toSVG('mask', { title: 'Our Little Arcade' }), 'mask-icon.svg is stale — run npm run icons');

const favicon = read('favicon.svg').toString();
assert.ok(favicon.startsWith('<svg xmlns='), 'a standalone SVG document');
assert.ok(favicon.includes(`viewBox="0 0 ${GRID} ${GRID}"`));
assert.ok(favicon.includes('<radialGradient'), 'the tile and the heart keep their gradients');
assert.ok(read('mask-icon.svg').toString().includes('#000000'), 'the pinned-tab mask is a flat silhouette');

// --- the PNGs are real PNGs of the right size --------------------------------
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
for (const [file, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  const png = read(file);
  assert.ok(png.subarray(0, 8).equals(SIGNATURE), `${file} is not a PNG`);
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(png.readUInt32BE(16), size, `${file} should be ${size}px wide`);
  assert.equal(png.readUInt32BE(20), size, `${file} should be ${size}px tall`);
  assert.equal(png[24], 8, 'eight bits per channel');
  assert.equal(png[25], 6, 'truecolour with alpha');
  assert.ok(png.includes(Buffer.from('IEND', 'ascii')), `${file} is truncated`);
}

// --- the drawing still draws something ---------------------------------------
const size = 24;
const pixels = rasterise(size, 'app', 2);
const at = (x, y) => {
  const offset = (y * size + x) * 4;
  return [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]];
};
assert.equal(at(size / 2, size / 2)[3], 255, 'the middle of the icon is opaque');
assert.equal(at(0, 0)[3], 0, 'the rounded corner is transparent');

const heartPixel = at(size / 2, Math.round(size * 0.45));
assert.ok(heartPixel[0] > 240 && heartPixel[1] > 200, 'the heart reads as pale cream');

const tilePixel = at(Math.round(size * 0.06), Math.round(size / 2));
assert.ok(tilePixel[0] > tilePixel[1] + 60, 'the tile behind it reads as cherry red');
assert.ok(heartPixel[1] > tilePixel[1] + 60, 'the heart stands off the tile');

const shapes = iconShapes('app');
assert.equal(shapes.filter(shape => shape.type === 'path').length, 2, 'the heart and the shadow under it');
assert.equal(iconShapes('mask').length, 1, 'the mask is a single silhouette');
assert.ok(iconShapes('mask').every(shape => shape.fill === '#000000'), 'the mask has no colour');

console.log('Icon checks passed: vectors match the artwork, PNGs are well formed, and the heart still draws.');
