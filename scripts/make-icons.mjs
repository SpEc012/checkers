// Draws every site icon from scripts/icon-art.mjs.
//
//   node scripts/make-icons.mjs          write the icons into public/
//   node scripts/make-icons.mjs --check  fail if the committed icons are stale
//
// The PNGs are rasterised and encoded here (zlib is the only dependency) so the
// tab icon, the pinned-tab mask and the installed-app icons all come from one
// description of the artwork.

import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { GRID, iconShapes, toSVG } from './icon-art.mjs';

const OUTPUTS = [
  { file: 'favicon.svg', build: () => Buffer.from(toSVG('app', { title: 'Our Little Arcade' })) },
  { file: 'mask-icon.svg', build: () => Buffer.from(toSVG('mask', { title: 'Our Little Arcade' })) },
  { file: 'apple-touch-icon.png', build: () => png(180) },
  { file: 'icon-192.png', build: () => png(192) },
  { file: 'icon-512.png', build: () => png(512) },
];

// ---------------------------------------------------------------- geometry

const radians = degrees => (degrees * Math.PI) / 180;

function unrotate(x, y, shape) {
  if (!shape.rot) return [x, y];
  const [cx, cy] = shape.type === 'ellipse' ? [shape.cx, shape.cy] : [shape.x + shape.w / 2, shape.y + shape.h / 2];
  const angle = radians(-shape.rot);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(angle) - dy * Math.sin(angle), cy + dx * Math.sin(angle) + dy * Math.cos(angle)];
}

function insideEllipse(x, y, shape) {
  const dx = (x - shape.cx) / shape.rx;
  const dy = (y - shape.cy) / shape.ry;
  return dx * dx + dy * dy <= 1;
}

function insideRoundRect(x, y, shape) {
  const halfW = shape.w / 2;
  const halfH = shape.h / 2;
  const r = Math.min(shape.r, halfW, halfH);
  const dx = Math.abs(x - (shape.x + halfW)) - (halfW - r);
  const dy = Math.abs(y - (shape.y + halfH)) - (halfH - r);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - r <= 0;
}

/** Flatten a command list into closed polygons of straight edges. */
function flatten(commands, steps = 18) {
  const polygons = [];
  let current = [];
  let cursor = [0, 0];
  for (const [command, ...n] of commands) {
    if (command === 'M') {
      if (current.length > 1) polygons.push(current);
      cursor = [n[0], n[1]];
      current = [cursor];
    } else if (command === 'C') {
      const [x0, y0] = cursor;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        current.push([
          u * u * u * x0 + 3 * u * u * t * n[0] + 3 * u * t * t * n[2] + t * t * t * n[4],
          u * u * u * y0 + 3 * u * u * t * n[1] + 3 * u * t * t * n[3] + t * t * t * n[5],
        ]);
      }
      cursor = [n[4], n[5]];
    } else if (command === 'Z') {
      if (current.length > 1) polygons.push(current);
      current = [];
    }
  }
  if (current.length > 1) polygons.push(current);
  return polygons;
}

function insidePolygons(x, y, polygons) {
  let winding = 0;
  for (const points of polygons) {
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if (y0 <= y && y1 > y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0) winding++;
      else if (y1 <= y && y0 > y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0) winding--;
    }
  }
  return winding !== 0;
}

// ---------------------------------------------------------------- painting

function rgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function gradientColour(fill, x, y) {
  const t = Math.min(1, Math.hypot(x - fill.cx, y - fill.cy) / fill.r);
  const stops = fill.stops;
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const span = upper[0] - lower[0] || 1;
  const mix = Math.min(1, Math.max(0, (t - lower[0]) / span));
  const a = rgb(lower[1]);
  const b = rgb(upper[1]);
  return [a[0] + (b[0] - a[0]) * mix, a[1] + (b[1] - a[1]) * mix, a[2] + (b[2] - a[2]) * mix];
}

function prepare(shapes) {
  return shapes.map(shape => ({
    ...shape,
    polygons: shape.type === 'path' ? flatten(shape.d) : null,
    alpha: shape.opacity === undefined ? 1 : shape.opacity,
    flat: typeof shape.fill === 'string' ? rgb(shape.fill) : null,
  }));
}

function covers(shape, x, y) {
  const [px, py] = unrotate(x, y, shape);
  if (shape.type === 'ellipse') return insideEllipse(px, py, shape);
  if (shape.type === 'roundRect') return insideRoundRect(px, py, shape);
  return insidePolygons(px, py, shape.polygons);
}

/** Paint the shape stack at one point, returning straight RGBA in 0..1. */
function sample(shapes, x, y) {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const shape of shapes) {
    if (!covers(shape, x, y)) continue;
    const [sr, sg, sb] = shape.flat || gradientColour(shape.fill, x, y);
    const sa = shape.alpha;
    r = sr * sa + r * (1 - sa);
    g = sg * sa + g * (1 - sa);
    b = sb * sa + b * (1 - sa);
    a = sa + a * (1 - sa);
  }
  return [r, g, b, a];
}

/** Rasterise a flavour into an RGBA buffer with supersampled edges. */
export function rasterise(size, flavour = 'app', samplesPerAxis = size > 256 ? 3 : 4) {
  const shapes = prepare(iconShapes(flavour));
  const pixels = Buffer.alloc(size * size * 4);
  const scale = GRID / size;
  const step = 1 / samplesPerAxis;
  const total = samplesPerAxis * samplesPerAxis;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samplesPerAxis; sy++) {
        for (let sx = 0; sx < samplesPerAxis; sx++) {
          const [sr, sg, sb, sa] = sample(shapes, (px + (sx + 0.5) * step) * scale, (py + (sy + 0.5) * step) * scale);
          // Accumulate premultiplied so transparent corners stay clean.
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const offset = (py * size + px) * 4;
      pixels[offset] = a ? Math.round(r / a) : 0;
      pixels[offset + 1] = a ? Math.round(g / a) : 0;
      pixels[offset + 2] = a ? Math.round(b / a) : 0;
      pixels[offset + 3] = Math.round((a / total) * 255);
    }
  }
  return pixels;
}

// ---------------------------------------------------------------- encoding

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Filter each scanline with whichever of the five PNG filters compresses best. */
function filterRows(pixels, size) {
  const stride = size * 4;
  const rows = [];
  const previous = Buffer.alloc(stride);
  for (let y = 0; y < size; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    let best = null;
    for (let type = 0; type < 5; type++) {
      const candidate = Buffer.alloc(stride + 1);
      candidate[0] = type;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const raw = row[i];
        const left = i >= 4 ? row[i - 4] : 0;
        const up = previous[i];
        const upLeft = i >= 4 ? previous[i - 4] : 0;
        const value =
          type === 0 ? raw
            : type === 1 ? raw - left
              : type === 2 ? raw - up
                : type === 3 ? raw - ((left + up) >> 1)
                  : raw - paeth(left, up, upLeft);
        const byte = value & 255;
        candidate[i + 1] = byte;
        score += byte < 128 ? byte : 256 - byte;
      }
      if (!best || score < best.score) best = { score, candidate };
    }
    rows.push(best.candidate);
    row.copy(previous);
  }
  return Buffer.concat(rows);
}

export function encodePNG(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(filterRows(pixels, size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = size => encodePNG(rasterise(size), size);

// ---------------------------------------------------------------- cli

function run() {
  const check = process.argv.includes('--check');
  const stale = [];
  for (const { file, build } of OUTPUTS) {
    const path = new URL(`../public/${file}`, import.meta.url);
    const next = build();
    if (check) {
      let current = null;
      try {
        current = readFileSync(path);
      } catch {
        stale.push(`${file} (missing)`);
        continue;
      }
      if (!current.equals(next)) stale.push(file);
    } else {
      writeFileSync(path, next);
      console.log(`public/${file} · ${(next.length / 1024).toFixed(1)} KB`);
    }
  }
  if (check && stale.length) {
    console.error(`Icons are out of date: ${stale.join(', ')}. Run npm run icons.`);
    process.exit(1);
  }
  if (check) console.log('Icons match scripts/icon-art.mjs.');
}

if (import.meta.url === `file://${process.argv[1]}`) run();
