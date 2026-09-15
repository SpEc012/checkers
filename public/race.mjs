// Ladybug Race — the scene, the bugs and the rhythm.
//
// Two ladybugs crawl a winding garden trail towards a ribbon. Tapping moves
// your bug; tapping *on the beat* moves it a great deal further, and a run of
// well-timed crawls builds a streak worth more than twice a plain one. That is
// the whole contest, and it is why a thumb and a keyboard are equally quick:
// the winning rate is about four crawls a second, which either can manage.
//
// This file draws and listens. It never decides anything: every crawl is handed
// back to app.mjs, which sends it to the room, and the lane positions it paints
// come from the state the server sent back. The only thing invented here is the
// smoothing between two snapshots and the prediction of your own crawls while
// they are still in the post.
//
// Reading order:
//   1  Geometry and gardens        4  Input
//   2  Building the scene          5  The frame loop
//   3  Painting a snapshot         6  The controller

import { RACE, raceBeat, raceTracks } from './arcade.mjs';
import { drawLovebug } from './lovebugs.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SIDES = ['rose', 'cream'];
const other = side => (side === 'rose' ? 'cream' : 'rose');

/* ------------------------------------------------- 1 geometry and gardens */

// One winding lane, drawn around y = 0. Both lanes use this exact path, moved
// down the scene — identical shape, identical length, identical race, whichever
// garden it is drawn in.
const LANE = 'M78 0C158-34 214 34 300 0 386-34 442 34 528 0 614-34 670 34 756 0 828-28 878 22 932 2';
const LANE_Y = { rose: 146, cream: 292 };
const SCENE = { width: 1000, height: 430 };

/** The three gardens. Only the scenery and the light change. */
const GARDENS = {
  tulip: {
    sky: ['#fff6e8', '#ffe6ec'],
    ground: '#eaf3dd',
    trail: ['#e8c49d', '#cfa276'],
    note: 'Warm afternoon sun, stepping stones and a whole row of pink tulips.',
  },
  creek: {
    sky: ['#f0f8f4', '#dcefe6'],
    ground: '#e2f0e4',
    trail: ['#e7cfae', '#c8a27a'],
    note: 'A creek winding under little wooden bridges, reeds and smooth pebbles.',
  },
  moon: {
    sky: ['#efe7f8', '#ddd0ee'],
    ground: '#e3dcf0',
    trail: ['#d9c8ea', '#b7a2d2'],
    note: 'Lavender dusk, soft moonlight, sleepy mushrooms and drifting fireflies.',
  },
};

const el = (tag, attributes = {}, children = []) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  for (const child of children) node.append(child);
  return node;
};

const html = (tag, className = '', text = '') => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** A tulip, standing on its own two leaves. */
const tulip = (x, y, scale, petal = '#ef8fae') => el('g', { transform: `translate(${x} ${y}) scale(${scale})` }, [
  el('path', { d: 'M0 0V-26', stroke: '#6f9c62', 'stroke-width': '3', fill: 'none', 'stroke-linecap': 'round' }),
  el('path', { d: 'M0-6C-11-7-15-15-14-20-6-18-1-13 0-6ZM1-11C10-13 15-20 14-25 6-23 2-17 1-11Z', fill: '#79a86a' }),
  el('path', { d: 'M-8-26q8-13 16 0l-2 11h-12Z', fill: petal }),
  el('path', { d: 'M-9-32q9 5 9 14 0-9 9-14v8q0 8-9 8t-9-8Z', fill: petal, opacity: '.82' }),
]);

/** A rounded pebble or stepping stone. */
const stone = (x, y, rx, fill = '#d9cfc2') => el('g', { transform: `translate(${x} ${y})` }, [
  el('ellipse', { rx, ry: rx * 0.66, fill }),
  el('ellipse', { cx: -rx * 0.24, cy: -rx * 0.22, rx: rx * 0.42, ry: rx * 0.24, fill: '#ffffff', opacity: '.35' }),
]);

/** A toadstool with a little cap. */
const mushroom = (x, y, scale) => el('g', { transform: `translate(${x} ${y}) scale(${scale})` }, [
  el('path', { d: 'M-5 0v-11h10V0Z', fill: '#f6eede' }),
  el('path', { d: 'M-14-11q3-14 14-14t14 14Z', fill: '#d9678c' }),
  el('circle', { cx: '-5', cy: '-16', r: '2.4', fill: '#fff1f5' }),
  el('circle', { cx: '5', cy: '-18', r: '1.8', fill: '#fff1f5' }),
]);

/** Reeds by the water. */
const reeds = (x, y, scale) => el('g', { transform: `translate(${x} ${y}) scale(${scale})` }, [
  el('path', {
    d: 'M0 0C-2-14-6-20-9-24M6 0C6-13 9-20 13-25M-4 0C-4-10-2-17 0-21',
    stroke: '#7ba874', 'stroke-width': '2.6', fill: 'none', 'stroke-linecap': 'round',
  }),
  el('ellipse', { cx: '13', cy: '-28', rx: '2.4', ry: '5', fill: '#a8794f' }),
]);

/** Planks over the creek, laid between the lanes. */
const bridge = (x, y) => el('g', { transform: `translate(${x} ${y})` }, [
  el('rect', { x: '-26', y: '-7', width: '52', height: '14', rx: '3', fill: '#c9925f' }),
  el('path', { d: 'M-14-7v14M0-7v14M14-7v14', stroke: '#a8743f', 'stroke-width': '2' }),
]);

/* --------------------------------------------------- 2 building the scene */

/** Shared gradients: the sky, and one shell colour per ladybug. */
function defs() {
  const sky = el('linearGradient', { id: 'race-sky', x1: '0', y1: '0', x2: '0', y2: '1' }, [
    el('stop', { class: 'race-sky-top', offset: '0', 'stop-color': '#fff6e8' }),
    el('stop', { class: 'race-sky-bottom', offset: '1', 'stop-color': '#ffe6ec' }),
  ]);
  const shell = (id, stops) => el('radialGradient', { id, cx: '34%', cy: '28%', r: '78%' },
    stops.map(([offset, color]) => el('stop', { offset, 'stop-color': color })));
  return el('defs', {}, [
    sky,
    shell('race-shell-rose', [['0', '#f6819c'], ['0.55', '#df4a6f'], ['1', '#ab2748']]),
    shell('race-shell-cream', [['0', '#fff3d9'], ['0.55', '#f0c489'], ['1', '#cf9a55']]),
    el('linearGradient', { id: 'race-creek', x1: '0', y1: '0', x2: '0', y2: '1' }, [
      el('stop', { offset: '0', 'stop-color': '#bfe0e8' }),
      el('stop', { offset: '1', 'stop-color': '#9ec8d8' }),
    ]),
  ]);
}

/** Everything behind the lanes, for one garden. */
function garden(track) {
  const parts = [];
  const look = GARDENS[track] || GARDENS.tulip;
  parts.push(el('rect', { width: SCENE.width, height: SCENE.height, fill: 'url(#race-sky)' }));
  parts.push(el('path', {
    d: `M0 96Q250 70 500 92T1000 78V${SCENE.height}H0Z`,
    fill: look.ground,
    opacity: '.75',
  }));

  if (track === 'tulip') {
    parts.push(el('circle', { cx: '880', cy: '56', r: '40', fill: '#ffe08a', opacity: '.55' }));
    parts.push(el('circle', { cx: '880', cy: '56', r: '24', fill: '#ffd36a', opacity: '.75' }));
    for (const [x, y, s] of [[60, 96, 1.5], [170, 88, 1.2], [268, 98, 1.6], [392, 86, 1.25],
      [508, 98, 1.5], [636, 88, 1.3], [744, 98, 1.55], [864, 104, 1.2]]) {
      parts.push(tulip(x, y, s));
    }
    for (const [x, y, r] of [[150, 232, 17], [318, 240, 13], [470, 228, 18], [640, 240, 14], [800, 230, 16]]) {
      parts.push(stone(x, y, r));
    }
    for (const [x, y, s] of [[110, 400, 1.7], [300, 410, 1.4], [520, 402, 1.8], [720, 412, 1.5], [900, 400, 1.6]]) {
      parts.push(tulip(x, y, s, '#e97ba3'));
    }
  }

  if (track === 'creek') {
    parts.push(el('path', {
      d: 'M0 214C150 190 220 248 380 224S620 190 760 220 940 244 1000 226V262C930 282 840 258 720 254S470 282 350 268 120 236 0 252Z',
      fill: 'url(#race-creek)',
      opacity: '.85',
    }));
    parts.push(el('path', {
      d: 'M40 238Q180 224 320 242T620 232T960 244',
      stroke: '#ffffff', 'stroke-width': '3', fill: 'none', opacity: '.5', 'stroke-linecap': 'round',
    }));
    for (const x of [230, 520, 810]) parts.push(bridge(x, 236));
    for (const [x, y, s] of [[70, 102, 1.5], [200, 94, 1.2], [350, 104, 1.6], [520, 92, 1.3],
      [690, 102, 1.5], [860, 96, 1.2]]) {
      parts.push(reeds(x, y, s));
    }
    for (const [x, y, r] of [[120, 398, 20], [280, 410, 14], [430, 400, 17], [610, 412, 22],
      [790, 398, 15], [930, 408, 19]]) {
      parts.push(stone(x, y, r, '#cfd6cf'));
    }
    for (const [x, y, s] of [[170, 406, 1.2], [520, 396, 1.1], [870, 404, 1.3]]) parts.push(reeds(x, y, s));
  }

  if (track === 'moon') {
    parts.push(el('circle', { cx: '870', cy: '58', r: '46', fill: '#fff6d8', opacity: '.35' }));
    parts.push(el('circle', { cx: '870', cy: '58', r: '27', fill: '#fdf3d3' }));
    parts.push(el('circle', { cx: '860', cy: '50', r: '5', fill: '#eadfba', opacity: '.7' }));
    parts.push(el('circle', { cx: '878', cy: '66', r: '3.4', fill: '#eadfba', opacity: '.7' }));
    for (const [x, y, s] of [[90, 100, 1.5], [240, 92, 1.2], [400, 102, 1.6], [560, 90, 1.3],
      [700, 100, 1.4], [820, 104, 1.1]]) {
      parts.push(mushroom(x, y, s));
    }
    for (const [x, y, s] of [[160, 404, 1.8], [340, 412, 1.4], [540, 402, 1.9], [730, 414, 1.5], [910, 402, 1.6]]) {
      parts.push(mushroom(x, y, s));
    }
    for (const [x, y, r] of [[250, 234, 12], [560, 240, 10], [840, 232, 13]]) parts.push(stone(x, y, r, '#cfc4e0'));
    // Fireflies drift on their own, in CSS.
    const flies = el('g', { class: 'race-fireflies' });
    for (let i = 0; i < 14; i++) {
      const spark = el('circle', {
        class: 'race-firefly',
        cx: 70 + (i * 67) % 880,
        cy: 60 + ((i * 131) % 330),
        r: (i % 3) + 2,
        fill: '#ffeaa0',
      });
      spark.style.setProperty('--delay', `${-(i * 0.73).toFixed(2)}s`);
      spark.style.setProperty('--drift', `${((i % 5) - 2) * 9}px`);
      flies.append(spark);
    }
    parts.push(flies);
  }

  return parts;
}

/** The start gate and the finish ribbon, set clear of where the bugs stand. */
function markers() {
  const post = (x, label) => el('g', { transform: `translate(${x} 0)`, class: 'race-post' }, [
    el('rect', { x: '-4', y: '108', width: '8', height: '218', rx: '4', fill: '#a8536c' }),
    el('rect', { x: '-36', y: '82', width: '72', height: '30', rx: '10', fill: '#b8395c' }),
    el('text', { x: '0', y: '103', 'text-anchor': 'middle', class: 'race-post-label' }, [
      document.createTextNode(label),
    ]),
  ]);
  return [post(40, 'START'), post(962, 'FINISH')];
}

/** One lane: a ribbon of trail with a dashed line down the middle. */
function laneGroup(side) {
  return el('g', { class: `race-lane race-lane-${side}`, transform: `translate(0 ${LANE_Y[side]})` }, [
    el('path', { class: 'race-trail', d: LANE }),
    el('path', { class: 'race-trail-top', d: LANE }),
    el('path', { class: 'race-trail-dashes', d: LANE }),
    el('path', { class: 'race-path', d: LANE, fill: 'none', stroke: 'none' }),
  ]);
}

/** A racing ladybug, wearing its side's shell. */
function racer(side) {
  const bug = drawLovebug({ className: `race-bug race-bug-${side}` });
  const shell = bug.querySelector('.lovebug-shell ellipse');
  if (shell) shell.setAttribute('fill', `url(#race-shell-${side})`);
  return bug;
}

/* ------------------------------------------------- 3 painting a snapshot */

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const pct = value => `${Math.round((value / RACE.length) * 100)}%`;

/**
 * Both lanes, smoothed. Your own bug also carries the crawls that have not
 * reached the server yet, so your taps feel instant while the finish line stays
 * the server's to call.
 */
function laneTargets(state, mine, lead) {
  const targets = {};
  for (const side of SIDES) {
    const own = side === mine;
    targets[side] = clamp(state.lane[side] + (own ? lead : 0), 0, RACE.length);
  }
  return targets;
}

/* --------------------------------------------------------------- 4 input */

const TYPING = 'input, textarea, select, [contenteditable="true"]';
// Online you crawl with any of these; side by side, A is the cherry bug and
// L the vanilla one, far enough apart for four hands on one keyboard.
const SHARED_KEYS = new Set([' ', 'Enter', 'ArrowUp', 'f', 'j', 'a', 'l']);
const LOCAL_KEYS = { a: 'rose', f: 'rose', l: 'cream', j: 'cream' };

/* ------------------------------------------------------ 5 the frame loop */

/**
 * Build the race surface inside `host`.
 *
 * @param {object} options
 * @param {HTMLElement} options.host          where the surface is built
 * @param {(action: object) => void} options.onAction   ready / track / lapse / abandon / rematch
 * @param {(side: string, tap: object) => void} options.onCrawl  one accepted crawl
 * @param {(side: string) => number} options.lead       distance still in the post
 * @param {object} options.audio              the arcade's sound module
 * @param {() => boolean} options.reducedMotion
 */
export function createRaceView({ host, onAction, onCrawl, lead, audio, reducedMotion = () => false }) {
  /* ---------------------------------------------------------- the markup */

  const scene = el('svg', {
    class: 'race-scene',
    viewBox: `0 0 ${SCENE.width} ${SCENE.height}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'Two ladybugs racing along a winding garden trail',
  });
  const backdrop = el('g', { class: 'race-garden' });
  const lanes = el('g', { class: 'race-lanes-art' });
  const bugs = el('g', { class: 'race-racers' });
  const sparkles = el('g', { class: 'race-sparkles' });
  scene.append(defs(), backdrop, lanes, ...markers(), bugs, sparkles);

  const laneNodes = {};
  const bugNodes = {};
  for (const side of SIDES) {
    const group = laneGroup(side);
    lanes.append(group);
    laneNodes[side] = { group, path: group.querySelector('.race-path') };
    const bug = racer(side);
    bugs.append(bug);
    bugNodes[side] = bug;
  }

  const stage = html('div', 'race-stage');
  const banner = html('p', 'race-callout');
  banner.setAttribute('role', 'status');
  banner.setAttribute('aria-live', 'polite');
  // The words sit on their own little pill so they stay readable over tulips,
  // water or moonlight alike.
  const callout = html('span');
  banner.append(callout);
  stage.append(scene, banner);

  const heatLine = html('p', 'eyebrow race-heat');
  const title = html('h2', 'race-title');
  const picker = html('div', 'race-picker');
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', 'Choose a track');
  const trackButtons = {};
  for (const [id, name] of [...Object.entries(raceTracks), ['random', 'Surprise us']]) {
    const button = html('button', 'race-track', name);
    button.type = 'button';
    button.onclick = () => onAction({ action: 'track', track: id });
    trackButtons[id] = button;
    picker.append(button);
  }

  const boards = html('div', 'race-boards');
  const boardNodes = {};
  for (const side of SIDES) {
    const row = html('div', `race-board race-board-${side}`);
    const top = html('div', 'race-board-top');
    const who = html('b', '', '');
    const place = html('span', 'race-place', '0%');
    top.append(who, place);
    const bar = html('div', 'race-bar');
    const fill = html('i', 'race-bar-fill');
    bar.append(fill);
    const pips = html('div', 'race-pips');
    row.append(top, bar, pips);
    boards.append(row);
    boardNodes[side] = { row, who, place, fill, pips };
  }

  const beatBar = html('div', 'race-beat');
  beatBar.setAttribute('aria-hidden', 'true');
  const beatRail = html('div', 'race-beat-rail');
  const beatMark = html('i', 'race-beat-mark');
  beatRail.append(html('i', 'race-beat-band'), beatMark);
  beatBar.append(beatRail);
  const beatLabel = html('p', 'race-beat-label', 'Crawl as the firefly crosses the glow — a run of good timing is worth twice a hurried tap.');

  const controls = html('div', 'race-controls');
  const note = html('p', 'surface-note race-note');

  host.replaceChildren(heatLine, title, picker, stage, boards, beatBar, beatLabel, controls, note);

  /* ------------------------------------------------------- moving parts */

  let view = null; // the latest snapshot from app.mjs
  let frame = null;
  let lastFrame = 0;
  let shown = { rose: 0, cream: 0 }; // eased lane positions
  let speed = { rose: 0, cream: 0 }; // lane units per second, for the legs
  let seen = { rose: { at: 0, lane: 0, rate: 0 }, cream: { at: 0, lane: 0, rate: 0 } };
  let guessed = { rose: 0, cream: 0 }; // streak as this browser believes it
  let lastTap = { rose: 0, cream: 0 };
  let lastPass = { rose: -1, cream: -1 };
  let flash = 0;
  let spokenBeat = -1;
  let heatKey = '';
  let controlKey = '';
  let finishSounded = '';
  let lapsedKey = '';
  let bugScale = 3;
  let geometry = null;

  const serverNow = () => Date.now() + (view?.clockOffset || 0);
  const phase = () => view?.state.phase;
  const racing = () => phase() === 'running' && serverNow() >= view.state.startAt;

  function measure() {
    try {
      const path = laneNodes.rose.path;
      geometry = { total: path.getTotalLength() };
    } catch {
      geometry = null; // very old engine: fall back to a straight line
    }
    bugScale = host.clientWidth && host.clientWidth < 520 ? 4.2 : 3.2;
  }

  /** Put one bug at `progress` (0…1) along its lane, facing the finish. */
  function placeBug(side, progress) {
    const node = bugNodes[side];
    const y = LANE_Y[side];
    let x = 78 + progress * (932 - 78);
    let dy = y;
    let angle = 0;
    if (geometry) {
      const at = clamp(progress * geometry.total, 0, geometry.total);
      const path = laneNodes[side].path;
      const here = path.getPointAtLength(at);
      const ahead = path.getPointAtLength(Math.min(geometry.total, at + 3));
      x = here.x;
      dy = here.y + y;
      angle = (Math.atan2(ahead.y - here.y, ahead.x - here.x) * 180) / Math.PI;
    }
    node.setAttribute('transform', `translate(${x.toFixed(1)} ${dy.toFixed(1)}) rotate(${(angle + 90).toFixed(1)}) scale(${bugScale})`);
  }

  /** A little heart where a boost landed. */
  function sparkle(side, progress) {
    if (reducedMotion()) return;
    const node = bugNodes[side];
    const transform = node.getAttribute('transform') || '';
    const match = transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/);
    if (!match) return;
    const spark = el('text', {
      class: 'race-spark',
      x: match[1],
      y: match[2],
      'text-anchor': 'middle',
    }, [document.createTextNode(progress > 0.92 ? '✦' : '♥')]);
    sparkles.append(spark);
    setTimeout(() => spark.remove(), 900);
  }

  /* --------------------------------------------------------------- input */

  /** One crawl from `side`, judged against the rhythm the player can see. */
  function crawl(side) {
    if (!view || !racing()) return;
    if (view.mode === 'online' && side !== view.side) return;
    if (view.state.finished[side] !== null) return;

    const at = performance.now();
    if (at - lastTap[side] < RACE.minTapMs) return;
    lastTap[side] = at;

    const elapsed = serverNow() - view.state.startAt;
    const beat = raceBeat(elapsed);
    const boost = beat.onBeat && beat.pass !== lastPass[side];
    if (boost) lastPass[side] = beat.pass;

    // Mirror the server's arithmetic so your own bug moves the moment you tap.
    guessed[side] = boost ? Math.min(guessed[side] + 1, RACE.streakCap) : Math.floor(guessed[side] / 2);
    onCrawl(side, {
      at,
      boost,
      value: boost ? RACE.step + RACE.boost * (1 + guessed[side] * RACE.streakGain) : RACE.step,
    });

    if (boost) {
      audio.spark(Math.min(guessed[side], 6));
      flash = at;
      sparkle(side, shown[side] / RACE.length);
    } else {
      audio.step();
    }
  }

  function onKeyDown(event) {
    if (!view || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target?.closest?.(TYPING)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

    if (!racing()) {
      // Space is the "I'm ready" key too, so a keyboard never needs the mouse.
      if (key === ' ' && phase() !== 'running' && !view.state.winner && view.canAct) {
        event.preventDefault();
        onAction({ action: 'ready', ready: !myReady() });
      }
      return;
    }
    if (view.mode === 'online') {
      if (!SHARED_KEYS.has(key)) return;
      event.preventDefault();
      crawl(view.side);
      return;
    }
    const side = LOCAL_KEYS[key];
    if (!side) return;
    event.preventDefault();
    crawl(side);
  }

  document.addEventListener('keydown', onKeyDown);

  /** Pointer handling shared by the crawl buttons: press, not click. */
  function crawlButton(side, label, hint) {
    const button = html('button', `race-crawl race-crawl-${side || 'mine'}`);
    button.type = 'button';
    button.append(html('b', '', label), html('small', '', hint));
    button.onpointerdown = event => {
      event.preventDefault();
      crawl(side || view.side);
    };
    // A keyboard press already arrives through the document listener.
    button.onkeydown = event => {
      if (event.key === ' ' || event.key === 'Enter') event.preventDefault();
    };
    return button;
  }

  /* ---------------------------------------------------------- the frame */

  function tick(time) {
    frame = requestAnimationFrame(tick);
    if (!view) return;
    const state = view.state;
    const now = time || performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    const server = serverNow();
    const mine = view.mode === 'online' ? view.side : null;
    const targets = laneTargets(state, mine, lead());
    // Frame-rate independent easing: the same catch-up on 60Hz and 120Hz.
    const ease = 1 - Math.exp(-dt * 16);

    for (const side of SIDES) {
      const track = seen[side];
      // Your own bug is already predicted, so it eases straight onto its target;
      // the other one glides along its last known pace between snapshots.
      const own = view.mode !== 'online' || side === mine;
      const goal = own || !track.at
        ? targets[side]
        : clamp(targets[side] + track.rate * (now - track.at), 0, RACE.length);
      const before = shown[side];
      shown[side] += (goal - shown[side]) * ease;
      if (Math.abs(goal - shown[side]) < 0.35) shown[side] = goal;
      speed[side] = dt ? (shown[side] - before) / dt : 0;

      placeBug(side, shown[side] / RACE.length);
      const walking = speed[side] > 1.5 && !reducedMotion();
      bugNodes[side].classList.toggle('is-walking', walking);
      bugNodes[side].style.setProperty('--scuttle', `${clamp(0.4 - speed[side] * 0.006, 0.1, 0.4).toFixed(2)}s`);
      boardNodes[side].fill.style.width = pct(shown[side]);
      boardNodes[side].place.textContent = pct(shown[side]);
    }

    // The countdown, the rhythm and whatever the callout should be saying.
    if (phase() === 'running') {
      const toGo = state.startAt - server;
      if (toGo > 0) {
        const step = toGo > 1600 ? 0 : 1;
        if (step !== spokenBeat) {
          spokenBeat = step;
          audio.countdown(step);
        }
        callout.textContent = step === 0 ? 'Ready…' : 'Set…';
        banner.dataset.tone = 'count';
        beatMark.style.left = '0%';
      } else {
        if (spokenBeat !== 2) {
          spokenBeat = 2;
          audio.countdown(2);
        }
        const elapsed = server - state.startAt;
        const beat = raceBeat(elapsed);
        beatMark.style.left = `${(beat.marker * 100).toFixed(1)}%`;
        beatBar.classList.toggle('on-beat', beat.onBeat);
        beatBar.classList.toggle('hit', now - flash < 180);
        const left = Math.ceil((state.startAt + RACE.limitMs - server) / 1000);
        const streak = Math.max(mine ? guessed[mine] : 0, mine ? state.streak[mine] : Math.max(state.streak.rose, state.streak.cream));
        banner.dataset.tone = left <= 15 ? 'hurry' : 'go';
        callout.textContent = left <= 15 ? `${Math.max(0, left)} seconds left!`
          : elapsed < 1400 ? 'Crawl!'
            : streak >= 3 ? `On the beat! ×${streak}`
              : 'Tap on the glow ♡';
      }
    } else {
      beatBar.classList.remove('on-beat', 'hit');
    }

    // Nobody crawled and the clock ran out: ask the room to call it, once.
    if (racing() && server > state.startAt + RACE.limitMs && view.canAct && lapsedKey !== heatKey) {
      lapsedKey = heatKey;
      onAction({ action: 'lapse' });
    }
  }

  function run(on) {
    if (on && frame === null) {
      measure();
      lastFrame = performance.now();
      frame = requestAnimationFrame(tick);
      addEventListener('resize', measure);
    } else if (!on && frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
      removeEventListener('resize', measure);
    }
  }

  const myReady = () => (view.mode === 'online' ? view.state.ready[view.side] : false);

  /* ------------------------------------------------------ 6 the controller */

  /** Rebuild the garden when the track changes. */
  function paintGarden(track) {
    backdrop.replaceChildren(...garden(track));
    const look = GARDENS[track] || GARDENS.tulip;
    scene.querySelector('.race-sky-top').setAttribute('stop-color', look.sky[0]);
    scene.querySelector('.race-sky-bottom').setAttribute('stop-color', look.sky[1]);
    scene.style.setProperty('--trail', look.trail[0]);
    scene.style.setProperty('--trail-edge', look.trail[1]);
    host.dataset.track = track;
    measure();
  }

  let paintedTrack = null;

  return {
    /** Fold a fresh snapshot into the surface. Called on every render. */
    update(next) {
      const fresh = !view || view.generation !== next.generation;
      view = next;
      const state = next.state;
      const names = next.names;

      if (paintedTrack !== state.track) {
        paintedTrack = state.track;
        paintGarden(state.track);
      }

      // A new heat puts both bugs back on the line straight away.
      const key = `${next.generation}:${state.heat}:${state.startAt}`;
      if (key !== heatKey) {
        heatKey = key;
        spokenBeat = -1;
        lastPass = { rose: -1, cream: -1 };
        lastTap = { rose: 0, cream: 0 };
        guessed = { rose: 0, cream: 0 };
        if (state.phase !== 'finished') {
          shown = { ...state.lane };
          seen = { rose: { at: 0, lane: 0, rate: 0 }, cream: { at: 0, lane: 0, rate: 0 } };
        }
      }
      if (fresh) shown = { ...state.lane };
      // Once every crawl has been acknowledged, the server's streak is the truth.
      if (!lead()) for (const side of SIDES) guessed[side] = state.streak[side];

      // Track how fast each bug is really moving, for the in-between frames.
      const now = performance.now();
      for (const side of SIDES) {
        const track = seen[side];
        if (state.lane[side] !== track.lane) {
          const gap = track.at ? now - track.at : 0;
          track.rate = gap > 40 && gap < 2500 ? clamp((state.lane[side] - track.lane) / gap, 0, 0.09) : 0;
          track.lane = state.lane[side];
          track.at = now;
        } else if (track.at && now - track.at > 900) {
          track.rate = 0;
        }
      }

      const over = !!state.winner;
      const heatsWon = side => state.points[side];
      heatLine.textContent = over
        ? 'THE RACE IS RUN'
        : `HEAT ${state.heat} · FIRST TO ${RACE.target} WINS THE MATCH`;
      title.textContent = state.phase === 'finished' && state.heatResult
        ? state.heatResult === 'draw'
          ? 'A photo finish!'
          : `${names[state.heatResult]} takes the heat.`
        : state.phase === 'running'
          ? 'Crawl, little one, crawl.'
          : 'Ready… set… crawl!';

      // The track picker is only live between heats, but you may browse the
      // gardens while you are still waiting for your person to arrive.
      const canPick = state.phase === 'ready' && !over && next.canPick;
      picker.hidden = state.phase === 'running' || over;
      for (const [id, button] of Object.entries(trackButtons)) {
        button.disabled = !canPick;
        button.classList.toggle('chosen', state.config.track === id);
        button.setAttribute('aria-pressed', String(state.config.track === id));
      }

      for (const side of SIDES) {
        const board = boardNodes[side];
        const you = next.mode === 'online' && next.side === side;
        board.who.textContent = `${names[side]}${you ? ' (you)' : ''}`;
        board.row.classList.toggle('leading', state.lane[side] > state.lane[other(side)]);
        board.row.classList.toggle('done', state.finished[side] !== null);
        board.pips.replaceChildren(...Array.from({ length: RACE.target }, (_, index) => {
          const pip = html('i', `race-pip${index < heatsWon(side) ? ' won' : ''}`);
          return pip;
        }));
        board.pips.setAttribute('aria-label', `${names[side]} has won ${heatsWon(side)} of ${RACE.target} heats`);
      }

      // Sound the ribbon once per heat.
      const finishKey = `${key}:${state.heatResult || ''}`;
      if (state.heatResult && finishSounded !== finishKey) {
        finishSounded = finishKey;
        audio.finish();
      }

      beatBar.hidden = state.phase !== 'running';
      beatLabel.hidden = state.phase !== 'running';

      // Controls: ready, crawl, or what happens next. Rebuilt only when they
      // actually change, so a crawl button is never pulled out from under a
      // thumb that is still pressing it.
      const shape = [over, state.phase, next.mode, myReady(), next.canAct, next.connected,
        next.rematch, names.rose, names.cream].join('|');
      if (shape !== controlKey) {
        controlKey = shape;
        controls.replaceChildren();
        controls.dataset.layout = 'single';
        if (over) {
          // A rematch is offered here as well as in the room panel, so a phone
          // never has to leave the race to say yes.
          const asked = next.rematch && next.rematch !== next.side;
          const waiting = next.rematch && next.rematch === next.side;
          const again = html('button', 'primary race-action',
            asked ? 'Yes, let’s race ♡' : waiting ? 'Asked for a rematch ♡' : 'Race again ↻');
          again.type = 'button';
          again.disabled = !next.canAct || waiting;
          again.onclick = () => onAction(asked ? { action: 'rematch', accept: true } : { action: 'rematch' });
          controls.append(again);
          if (asked) {
            const no = html('button', 'race-action', 'Keep this one');
            no.type = 'button';
            no.onclick = () => onAction({ action: 'rematch', accept: false });
            controls.append(no);
          }
        } else if (state.phase === 'running') {
          if (next.mode === 'local') {
            controls.dataset.layout = 'pair';
            controls.append(
              crawlButton('rose', `${names.rose} · crawl`, 'Tap here, or press A'),
              crawlButton('cream', `${names.cream} · crawl`, 'Tap here, or press L'),
            );
          } else {
            controls.append(crawlButton(null, 'Crawl! ♡', 'Tap here, or press space'));
          }
          if (!next.connected) {
            const restart = html('button', 'race-action', 'Restart this heat ↻');
            restart.type = 'button';
            restart.onclick = () => onAction({ action: 'abandon' });
            controls.append(restart);
          }
        } else {
          const label = next.mode === 'local'
            ? state.phase === 'finished' ? 'Line them up again ↻' : 'Ready… set… crawl!'
            : myReady() ? 'Waiting for your person ♡' : 'I’m ready ♡';
          const start = html('button', 'primary race-action', label);
          start.type = 'button';
          start.disabled = !next.canAct || (next.mode === 'online' && myReady());
          start.onclick = () => onAction({ action: 'ready', ready: true });
          controls.append(start);
          if (next.mode === 'online' && myReady()) {
            const cancel = html('button', 'race-action', 'Not yet');
            cancel.type = 'button';
            cancel.onclick = () => onAction({ action: 'ready', ready: false });
            controls.append(cancel);
          }
        }
      }

      // The callout and the note carry the story when nothing is moving.
      if (state.phase === 'ready') {
        banner.dataset.tone = 'wait';
        callout.textContent = next.mode === 'local'
          ? 'Both bugs on the line.'
          : state.ready.rose && state.ready.cream ? 'Here we go…'
            : state.ready[next.side] ? `Waiting for ${names[other(next.side)]}…`
              : !next.connected ? 'Waiting for your person to arrive…'
                : 'Say when ♡';
      } else if (state.phase === 'finished') {
        banner.dataset.tone = 'done';
        callout.textContent = over
          ? state.winner === 'draw' ? 'Dead level. Both of you.' : `${names[state.winner]} wins the match!`
          : state.heatResult === 'draw' ? 'Nose to nose!'
            : `${names[state.heatResult]} crosses first!`;
      }

      note.textContent = state.phase === 'running' && !next.connected
        ? 'Your person dropped out of this heat. Restart it when you are both back — the score is safe.'
        : `${(GARDENS[state.track] || GARDENS.tulip).note} Every track is exactly the same length, so the only thing that matters is your rhythm.`;

      run(true);
    },

    /** Leaving the game: stop the loop and the listeners. */
    stop() {
      run(false);
    },

    destroy() {
      run(false);
      document.removeEventListener('keydown', onKeyDown);
    },
  };
}
