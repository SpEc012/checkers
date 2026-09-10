// Site icons. The artwork lives in scripts/icon-art.mjs and every file in
// public/ is generated from it, so this test guards against the committed
// icons drifting away from the source drawing.
//
// Run `npm run icons` after changing the artwork.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toSVG, iconShapes, GRID } from '../scripts/icon-art.mjs';
import { rasterise } from '../scripts/make-icons.mjs';

const read = file => readFileSync(new URL(`../public/${file}`, import.meta.url));

// --- the vectors match the artwork ------------------------------------------
assert.equal(read('favicon.svg').toString(), toSVG('app', { title: 'Our Little Arcade' }), 'favicon.svg is stale — run npm run icons');
assert.equal(read('mask-icon.svg').toString(), toSVG('mask', { title: 'Heart' }), 'mask-icon.svg is stale — run npm run icons');

const favicon = read('favicon.svg').toString();
assert.ok(favicon.startsWith('<svg xmlns='), 'a standalone SVG document');
assert.ok(favicon.includes(`viewBox="0 0 ${GRID} ${GRID}"`));
assert.ok(favicon.includes('<radialGradient'), 'the shell keeps its sheen');
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

const middle = at(size / 2, Math.round(size * 0.62));
assert.ok(middle[0] > middle[2], 'the shell reads as a warm red');

const shapes = iconShapes('app');
assert.ok(shapes.some(shape => shape.type === 'path'), 'the heart spot is still there');
assert.ok(iconShapes('mask').every(shape => shape.fill === '#000000'), 'the mask has no colour');

console.log('Icon checks passed: vectors match the artwork, PNGs are well formed, and the lovebug still draws.');
