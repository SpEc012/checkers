// The site mark, described once and emitted as both SVG and PNG.
//
// One heart on a cherry tile — the same thing the header brandmark shows.
// Everything is drawn on a 64 x 64 grid from three primitives (ellipse,
// rounded rectangle, cubic path) so the same shape list can become vector
// markup for the tab icon or be rasterised into the PNGs iOS and Android ask
// for. One source means the tab icon and the home-screen icon cannot drift.

export const GRID = 64;

export const palette = {
  tileLight: '#c43e63',
  tileMid: '#ae3155',
  tileDeep: '#8a2041',
  heartLight: '#fff6f3',
  heartMid: '#ffe6e6',
  heartDeep: '#ffcdd6',
  glint: '#ffffff',
};

// Classic heart outline, normalised into a 0..1 box so it can be dropped
// anywhere on the grid at any size.
const HEART_UNIT = [
  ['M', 0.7375, 0],
  ['C', 0.63125, 0, 0.540625, 0.091216, 0.5, 0.189189],
  ['C', 0.459375, 0.091216, 0.36875, 0, 0.2625, 0],
  ['C', 0.11875, 0, 0, 0.128378, 0, 0.283784],
  ['C', 0, 0.601351, 0.296875, 0.685811, 0.5, 1],
  ['C', 0.690625, 0.702703, 1, 0.591216, 1, 0.283784],
  ['C', 1, 0.128378, 0.88125, 0, 0.7375, 0],
  ['Z'],
];

/** A heart path centred on (cx, cy), `w` wide and `h` tall. */
export function heart(cx, cy, w, h = w * 0.92) {
  return HEART_UNIT.map(([command, ...numbers]) => {
    const points = [];
    for (let i = 0; i < numbers.length; i += 2) {
      points.push(cx + (numbers[i] - 0.5) * w, cy + (numbers[i + 1] - 0.5) * h);
    }
    return [command, ...points];
  });
}

const tileGradient = {
  type: 'radial',
  cx: 20,
  cy: 14,
  r: 66,
  stops: [
    [0, palette.tileLight],
    [0.55, palette.tileMid],
    [1, palette.tileDeep],
  ],
};

const heartGradient = {
  type: 'radial',
  cx: 24,
  cy: 22,
  r: 42,
  stops: [
    [0, palette.heartLight],
    [0.6, palette.heartMid],
    [1, palette.heartDeep],
  ],
};

/**
 * Shape list for one icon flavour.
 * - `app`: the full colour mark used for the favicon and installed icons.
 * - `mask`: a flat silhouette for Safari's pinned-tab mask.
 */
export function iconShapes(flavour = 'app') {
  if (flavour === 'mask') {
    return [{ type: 'path', d: heart(32, 33, 50, 46), fill: '#000000' }];
  }
  return [
    { type: 'roundRect', x: 0, y: 0, w: GRID, h: GRID, r: 15, fill: tileGradient },
    // A whisper of a shadow under the heart keeps it off the tile.
    { type: 'path', d: heart(32, 35.4, 40.5, 37), fill: '#5d1029', opacity: 0.22 },
    { type: 'path', d: heart(32, 33.4, 40, 36.5), fill: heartGradient },
    { type: 'ellipse', cx: 22.4, cy: 24.2, rx: 4.6, ry: 2.4, rot: -34, fill: palette.glint, opacity: 0.36 },
  ];
}

const round = n => Number(n.toFixed(3));

function pathData(commands) {
  return commands
    .map(([command, ...numbers]) => command + numbers.map(round).join(' '))
    .join('');
}

function gradientMarkup(fill, id) {
  const stops = fill.stops
    .map(([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`)
    .join('');
  return `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${fill.cx}" cy="${fill.cy}" r="${fill.r}">${stops}</radialGradient>`;
}

function shapeCentre(shape) {
  return shape.type === 'ellipse' ? [shape.cx, shape.cy] : [shape.x + shape.w / 2, shape.y + shape.h / 2];
}

function shapeMarkup(shape, fill) {
  const opacity = shape.opacity === undefined ? '' : ` opacity="${shape.opacity}"`;
  const rotation = shape.rot ? ` transform="rotate(${shape.rot} ${shapeCentre(shape).join(' ')})"` : '';
  if (shape.type === 'ellipse') {
    return `<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" fill="${fill}"${opacity}${rotation}/>`;
  }
  if (shape.type === 'roundRect') {
    return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.r}" fill="${fill}"${opacity}${rotation}/>`;
  }
  return `<path d="${pathData(shape.d)}" fill="${fill}"${opacity}${rotation}/>`;
}

/** Render a flavour as standalone SVG markup. */
export function toSVG(flavour = 'app', { title = 'Our Little Arcade' } = {}) {
  const shapes = iconShapes(flavour);
  const defs = [];
  const body = shapes
    .map((shape, index) => {
      let fill = shape.fill;
      if (typeof fill === 'object') {
        const id = `g${index}`;
        defs.push(gradientMarkup(fill, id));
        fill = `url(#${id})`;
      }
      return shapeMarkup(shape, fill);
    })
    .join('');
  const defsMarkup = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" role="img" aria-label="${title}">${defsMarkup}${body}</svg>\n`;
}
