// The lovebug mark, described once and emitted as both SVG and PNG.
//
// Everything is drawn on a 64 x 64 grid with three primitives — ellipse,
// rounded rectangle and cubic path — so the same shape list can be turned into
// vector markup (favicon.svg, mask-icon.svg) or rasterised into the PNG icons
// that iOS and Android ask for. Keeping one source means the tab icon and the
// home-screen icon can never drift apart.

export const GRID = 64;

export const palette = {
  cream: '#fff8f2',
  blush: '#ffe4ea',
  petal: '#f7c8d6',
  shellLight: '#f4718f',
  shellMid: '#df4a6f',
  shellDeep: '#b32a4c',
  ink: '#3b2130',
  inkSoft: '#7c1d3a',
  white: '#fffdfb',
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

const shellGradient = {
  type: 'radial',
  cx: 24,
  cy: 25,
  r: 30,
  stops: [
    [0, palette.shellLight],
    [0.55, palette.shellMid],
    [1, palette.shellDeep],
  ],
};

const backdropGradient = {
  type: 'radial',
  cx: 23,
  cy: 20,
  r: 58,
  stops: [
    [0, palette.cream],
    [0.6, palette.blush],
    [1, palette.petal],
  ],
};

/** The bug itself: shell, spots, face and antennae, without any backdrop. */
function lovebugShapes() {
  return [
    // Antennae, drawn first so the head caps their roots.
    { type: 'roundRect', x: 25.4, y: 3.6, w: 1.9, h: 9, r: 0.95, rot: -20, fill: palette.ink },
    { type: 'roundRect', x: 36.7, y: 3.6, w: 1.9, h: 9, r: 0.95, rot: 20, fill: palette.ink },
    { type: 'ellipse', cx: 24.2, cy: 3.8, rx: 2.5, ry: 2.5, fill: palette.ink },
    { type: 'ellipse', cx: 39.8, cy: 3.8, rx: 2.5, ry: 2.5, fill: palette.ink },

    // Wing shell.
    { type: 'ellipse', cx: 32, cy: 34, rx: 20, ry: 18.6, fill: shellGradient },
    { type: 'roundRect', x: 31.05, y: 16, w: 1.9, h: 35, r: 0.95, fill: palette.inkSoft, opacity: 0.45 },

    // A soft gloss across the top-left of the shell.
    { type: 'ellipse', cx: 22.6, cy: 24, rx: 6.6, ry: 2.7, rot: -32, fill: palette.glint, opacity: 0.2 },

    // Spots: two up top, a heart in the middle, two little ones below.
    { type: 'ellipse', cx: 21.4, cy: 29.6, rx: 3.9, ry: 3.7, fill: palette.ink },
    { type: 'ellipse', cx: 42.6, cy: 29.6, rx: 3.9, ry: 3.7, fill: palette.ink },
    { type: 'path', d: heart(32, 40, 10.6), fill: palette.ink },
    { type: 'ellipse', cx: 22.6, cy: 42.4, rx: 2.7, ry: 2.5, fill: palette.ink },
    { type: 'ellipse', cx: 41.4, cy: 42.4, rx: 2.7, ry: 2.5, fill: palette.ink },

    // Head and face.
    { type: 'ellipse', cx: 32, cy: 17, rx: 11, ry: 10.3, fill: palette.ink },
    { type: 'ellipse', cx: 27.3, cy: 15.9, rx: 3.2, ry: 3.4, fill: palette.white },
    { type: 'ellipse', cx: 36.7, cy: 15.9, rx: 3.2, ry: 3.4, fill: palette.white },
    { type: 'ellipse', cx: 27.9, cy: 16.7, rx: 1.6, ry: 1.7, fill: palette.ink },
    { type: 'ellipse', cx: 37.3, cy: 16.7, rx: 1.6, ry: 1.7, fill: palette.ink },
    { type: 'ellipse', cx: 27.0, cy: 15.0, rx: 0.9, ry: 0.9, fill: palette.glint, opacity: 0.9 },
    { type: 'ellipse', cx: 36.4, cy: 15.0, rx: 0.9, ry: 0.9, fill: palette.glint, opacity: 0.9 },

    // Rosy cheeks, tucked under the eyes.
    { type: 'ellipse', cx: 25.6, cy: 21.2, rx: 2.4, ry: 1.5, fill: palette.shellLight, opacity: 0.5 },
    { type: 'ellipse', cx: 38.4, cy: 21.2, rx: 2.4, ry: 1.5, fill: palette.shellLight, opacity: 0.5 },
  ];
}

/**
 * Shape list for one icon flavour.
 * - `app`: the full colour mark used for the favicon and installed icons.
 * - `mask`: a flat silhouette for Safari's pinned-tab mask.
 */
export function iconShapes(flavour = 'app') {
  if(flavour === 'mask')return [{type:'path',d:heart(32,33,48,44),fill:'#000000'}];
  return [
    {type:'roundRect',x:0,y:0,w:64,h:64,r:15,fill:backdropGradient},
    {type:'path',d:heart(32,34,46,42),fill:shellGradient}
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

function shapeCentre(shape) {
  return shape.type === 'ellipse' ? [shape.cx, shape.cy] : [shape.x + shape.w / 2, shape.y + shape.h / 2];
}

/** Render a flavour as standalone SVG markup. */
export function toSVG(flavour = 'app', { title = 'Lovebug' } = {}) {
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
