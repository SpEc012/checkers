// Lovebugs: the little ladybirds that live on the page.
//
// They are meant to be found rather than noticed. A pair of them keep to the
// edges and corners of the viewport, crawl slowly on six jointed legs, leave a
// faint dotted trail, and only rarely open their wings. The drawing is a plain
// seven-spot ladybird — red shell, black seam and spots, dark pronotum with two
// pale marks — the same bug that was tucked into the corners before, just alive
// now. The same drawing is reused for the still ones in the layout.
//
// Nothing here touches the DOM until a function is called, so the pure motion
// helpers below can be unit tested in Node.

const SVG_NS = 'http://www.w3.org/2000/svg';

export const settings = {
  edgeMargin: 52, // how close to the viewport edge the bugs stay
  cornerBias: 3.2, // >1 pulls waypoints towards the ends of an edge
  edgeWeights: [0.12, 0.26, 0.36, 0.26], // top, right, bottom, left — the header gets the fewest visitors
  walkSpeed: 18, // px per second — a slow, unhurried crawl
  flySpeed: 132,
  walkTurn: 2.2, // radians per second
  flyTurn: 3.2,
  walkDotGap: 9, // px between trail dots
  flyDotGap: 22,
  dotLife: 4200, // ms before a trail dot has faded away
  strideLength: 3.4, // px of travel per radian of leg swing
  strideSwing: 13, // degrees a leg swings either side
  shyRadius: 72,
  arriveRadius: 12,
};

// ------------------------------------------------------------------ motion

/** Wrap an angle into -PI..PI. */
export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Turn `from` towards `to`, never faster than `maxTurn` radians. */
export function steer(from, to, maxTurn) {
  const delta = wrapAngle(to - from);
  return wrapAngle(from + Math.max(-maxTurn, Math.min(maxTurn, delta)));
}

/** Push a 0..1 value towards both ends, so an edge favours its corners. */
export function towardsEnds(u, strength = settings.cornerBias) {
  return u < 0.5 ? 0.5 * (2 * u) ** strength : 1 - 0.5 * (2 * (1 - u)) ** strength;
}

/** Choose 0 (top), 1 (right), 2 (bottom) or 3 (left) from the edge weights. */
export function pickEdge(u, weights = settings.edgeWeights) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let running = Math.min(Math.max(u, 0), 0.999999) * total;
  for (let edge = 0; edge < weights.length; edge++) {
    running -= weights[edge];
    if (running < 0) return edge;
  }
  return weights.length - 1;
}

/**
 * Pick somewhere to go. Bugs live in the band along one edge of the page and
 * favour its corners; only a rare flight cuts across the middle.
 */
export function pickWaypoint(width, height, { random = Math.random, crossing = false } = {}) {
  const margin = Math.min(settings.edgeMargin, width / 3, height / 3);
  if (crossing) {
    return {
      x: margin + random() * Math.max(1, width - margin * 2),
      y: margin + random() * Math.max(1, height - margin * 2),
    };
  }
  const edge = pickEdge(random());
  const along = towardsEnds(random());
  const depth = random() * margin;
  if (edge === 0) return { x: along * width, y: depth };
  if (edge === 1) return { x: width - depth, y: along * height };
  if (edge === 2) return { x: along * width, y: height - depth };
  return { x: depth, y: along * height };
}

/** Keep a point inside the viewport with a little breathing room. */
export function clampToViewport(point, width, height, pad = 14) {
  return {
    x: Math.max(pad, Math.min(width - pad, point.x)),
    y: Math.max(pad, Math.min(height - pad, point.y)),
  };
}

// ------------------------------------------------------------------ drawing

function el(tag, attributes = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  for (const child of children) node.append(child);
  return node;
}

const HEART_D =
  'M0-3.1C-1.1-4.6-3.4-4.3-3.9-2.4-4.4-.5-2.4 1.5 0 3.6 2.4 1.5 4.4-.5 3.9-2.4 3.4-4.3 1.1-4.6 0-3.1Z';

const SHELL_INK = '#241417';
const HEAD_INK = '#171012';

/**
 * Six legs in two alternating tripods: front-left, middle-right and back-left
 * swing together, then the other three. Each entry is the point the leg pivots
 * on, the outline to draw, and which tripod it belongs to.
 */
const LEGS = [
  { pivot: [-5.0, -5.0], d: 'M-5-5-9.2-7.8-11-6.6', tripod: 0 },
  { pivot: [5.0, -5.0], d: 'M5-5 9.2-7.8 11-6.6', tripod: 1 },
  { pivot: [-6.4, -0.4], d: 'M-6.4-.4-11.2-1.2-12.6.4', tripod: 1 },
  { pivot: [6.4, -0.4], d: 'M6.4-.4 11.2-1.2 12.6.4', tripod: 0 },
  { pivot: [-5.2, 4.6], d: 'M-5.2 4.6-9 7.6-10.2 9.4', tripod: 0 },
  { pivot: [5.2, 4.6], d: 'M5.2 4.6 9 7.6 10.2 9.4', tripod: 1 },
];

/** Shared gradients, defined once per document. */
function ensureDefs() {
  if (document.getElementById('lovebug-defs')) return;
  const defs = el('defs', {}, [
    el('radialGradient', { id: 'lovebug-shell', cx: '36%', cy: '26%', r: '80%' }, [
      el('stop', { offset: '0', 'stop-color': '#e2564a' }),
      el('stop', { offset: '0.5', 'stop-color': '#cc2f2c' }),
      el('stop', { offset: '1', 'stop-color': '#951a1e' }),
    ]),
    el('radialGradient', { id: 'lovebug-wing', cx: '40%', cy: '30%', r: '80%' }, [
      el('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.7' }),
      el('stop', { offset: '1', 'stop-color': '#e7d8dd', 'stop-opacity': '0.22' }),
    ]),
  ]);
  const host = el('svg', { id: 'lovebug-defs', width: '0', height: '0', 'aria-hidden': 'true' }, [defs]);
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  document.body.prepend(host);
}

/**
 * Build one ladybird, drawn facing up around the origin in roughly a 28 unit
 * box. The caller positions it with a transform.
 */
export function drawLovebug({ className = '' } = {}) {
  ensureDefs();

  // Legs first so the body covers where they join it.
  const legs = el('g', { class: 'lovebug-legs' }, LEGS.map(leg =>
    el('g', { class: 'lovebug-leg', 'data-tripod': leg.tripod }, [el('path', { d: leg.d })])));

  const wings = el('g', { class: 'lovebug-wings' }, [
    el('ellipse', { class: 'lovebug-wing lovebug-wing-left', cx: '-8', cy: '3', rx: '8.6', ry: '4.6', fill: 'url(#lovebug-wing)' }),
    el('ellipse', { class: 'lovebug-wing lovebug-wing-right', cx: '8', cy: '3', rx: '8.6', ry: '4.6', fill: 'url(#lovebug-wing)' }),
  ]);

  // Elytra with the classic seven spots.
  const shell = el('g', { class: 'lovebug-shell' }, [
    el('ellipse', { cx: '0', cy: '2', rx: '8.8', ry: '10', fill: 'url(#lovebug-shell)' }),
    el('rect', { x: '-0.45', y: '-7.4', width: '0.9', height: '19', rx: '0.45', fill: SHELL_INK, opacity: '0.85' }),
    el('ellipse', { cx: '0', cy: '-5.4', rx: '1.8', ry: '1.5', fill: SHELL_INK }),
    el('ellipse', { cx: '-4.2', cy: '-2.2', rx: '1.9', ry: '1.8', fill: SHELL_INK }),
    el('ellipse', { cx: '4.2', cy: '-2.2', rx: '1.9', ry: '1.8', fill: SHELL_INK }),
    el('ellipse', { cx: '-5.2', cy: '2.6', rx: '2', ry: '1.9', fill: SHELL_INK }),
    el('ellipse', { cx: '5.2', cy: '2.6', rx: '2', ry: '1.9', fill: SHELL_INK }),
    el('ellipse', { cx: '-2.9', cy: '6.8', rx: '1.7', ry: '1.6', fill: SHELL_INK }),
    el('ellipse', { cx: '2.9', cy: '6.8', rx: '1.7', ry: '1.6', fill: SHELL_INK }),
    el('ellipse', { cx: '-4.4', cy: '-4.4', rx: '2.8', ry: '1.1', fill: '#ffffff', opacity: '0.16', transform: 'rotate(-36 -4.4 -4.4)' }),
  ]);

  // Pronotum and the little head peeking out from under it.
  const head = el('g', { class: 'lovebug-head' }, [
    el('ellipse', { cx: '0', cy: '-10.6', rx: '3.1', ry: '2.3', fill: HEAD_INK }),
    el('ellipse', { cx: '0', cy: '-8', rx: '5.6', ry: '3.3', fill: HEAD_INK }),
    el('ellipse', { cx: '-3.1', cy: '-9', rx: '1.5', ry: '1.05', fill: '#f0e7e1', opacity: '0.9' }),
    el('ellipse', { cx: '3.1', cy: '-9', rx: '1.5', ry: '1.05', fill: '#f0e7e1', opacity: '0.9' }),
  ]);

  const antennae = el('g', { class: 'lovebug-antennae' }, [
    el('path', { d: 'M-1.9-12.1-3.4-14.2M1.9-12.1 3.4-14.2' }),
  ]);

  const body = el('g', { class: 'lovebug-body' }, [legs, wings, shell, head, antennae]);
  const shadow = el('ellipse', { class: 'lovebug-shadow', cx: '0', cy: '5', rx: '8', ry: '3.2', opacity: '0.16' });
  return el('g', { class: `lovebug ${className}`.trim() }, [shadow, body]);
}

/** Drop a ready-made bug into a decorative slot in the layout. */
export function decorate(host, { size = 20, tilt = 0 } = {}) {
  const svg = el('svg', {
    class: 'lovebug-decor',
    viewBox: '-15 -16 30 32',
    width: size,
    height: size * 1.066,
    'aria-hidden': 'true',
  }, [drawLovebug({ className: 'lovebug-resting' })]);
  svg.style.setProperty('--tilt', `${tilt}deg`);
  host.replaceChildren(svg);
  return svg;
}

// ------------------------------------------------------------------ the colony

const random = (min, max) => min + Math.random() * (max - min);

/**
 * Start a colony of wandering lovebugs.
 * @param {object} options
 * @param {number|(() => number)} options.count how many bugs, re-read each time
 *   the colony is switched on so a phone gets fewer than a desktop.
 * @param {HTMLElement} options.mount where the fixed layer is attached.
 * @returns a controller; every method is safe to call at any time.
 */
export function createLovebugs({ count = 2, mount = document.body } = {}) {
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const layer = document.createElement('div');
  layer.className = 'lovebug-layer';
  layer.setAttribute('aria-hidden', 'true');

  const canvas = el('svg', { class: 'lovebug-canvas' });
  const trailGroup = el('g', { class: 'lovebug-trail' });
  const bugGroup = el('g', { class: 'lovebug-swarm' });
  canvas.append(trailGroup, bugGroup);
  layer.append(canvas);

  let width = 0;
  let height = 0;
  let bugs = [];
  let frame = null;
  let lastTime = 0;
  let enabled = false;
  let party = 0; // ms of celebration left
  const pointer = { x: -999, y: -999, at: 0 };

  function measure() {
    width = layer.clientWidth || innerWidth;
    height = layer.clientHeight || innerHeight;
    canvas.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const bug of bugs) {
      Object.assign(bug, clampToViewport(bug, width, height));
      bug.target = clampToViewport(bug.target, width, height);
    }
  }

  // Start the colony in opposite corners rather than bunched together.
  const NESTS = [
    { x: 0.06, y: 0.82 },
    { x: 0.95, y: 0.2 },
    { x: 0.9, y: 0.9 },
    { x: 0.08, y: 0.16 },
  ];

  function spawn(index) {
    const nest = NESTS[index % NESTS.length];
    const start = clampToViewport(
      { x: width * nest.x + random(-20, 20), y: height * nest.y + random(-20, 20) },
      width,
      height,
    );
    return {
      ...start,
      heading: random(-Math.PI, Math.PI),
      target: pickWaypoint(width, height),
      mode: 'idle',
      wait: random(1, 6) + index * 2,
      lift: 0,
      scale: random(0.5, 0.68),
      wobble: random(0, Math.PI * 2),
      gait: random(0, Math.PI * 2),
      sinceDot: 0,
      startled: 0,
    };
  }

  function build() {
    const total = typeof count === 'function' ? count() : count;
    bugs = Array.from({ length: total }, (_, index) => {
      const bug = spawn(index);
      bug.node = drawLovebug();
      bug.body = bug.node.querySelector('.lovebug-body');
      bug.shadow = bug.node.querySelector('.lovebug-shadow');
      bug.legs = [...bug.node.querySelectorAll('.lovebug-leg')];
      bugGroup.append(bug.node);
      return bug;
    });
  }

  /** Leave one dot of the faint path the bug is tracing. */
  function dropDot(bug) {
    const flying = bug.lift > 0.25;
    // The wrapper holds the position so the fade may animate `transform`.
    const dot = party > 0
      ? el('path', { class: 'lovebug-dot lovebug-dot-heart', d: HEART_D })
      : el('circle', { class: 'lovebug-dot', cx: '0', cy: '0', r: flying ? 1.5 : 2.1 });
    if (flying) dot.classList.add('lovebug-dot-air');
    const spin = party > 0 ? ` rotate(${random(-25, 25)})` : '';
    trailGroup.append(el('g', { transform: `translate(${bug.x.toFixed(1)} ${bug.y.toFixed(1)})${spin}` }, [dot]));

    // Hold the dot briefly so the path reads, then let it fade right out.
    const peak = party > 0 ? 0.5 : flying ? 0.22 : 0.34;
    const animation = dot.animate(
      [
        { opacity: 0, transform: 'scale(.4)', offset: 0 },
        { opacity: peak, transform: 'scale(1)', offset: 0.07 },
        { opacity: peak * 0.75, transform: 'scale(1)', offset: 0.45 },
        { opacity: 0, transform: 'scale(.35)', offset: 1 },
      ],
      { duration: settings.dotLife, easing: 'ease-out', fill: 'forwards' },
    );
    const clear = () => dot.parentNode?.remove();
    if (animation) animation.addEventListener('finish', clear, { once: true });
    else setTimeout(clear, settings.dotLife);
  }

  function takeOff(bug, { crossing = Math.random() < 0.25 } = {}) {
    bug.mode = 'fly';
    bug.target = clampToViewport(pickWaypoint(width, height, { crossing }), width, height);
  }

  function walk(bug) {
    bug.mode = 'walk';
    bug.target = clampToViewport(pickWaypoint(width, height), width, height);
  }

  function rest(bug) {
    bug.mode = 'idle';
    // Long stillnesses are the point: a bug you have to notice.
    bug.wait = Math.random() < 0.35 ? random(9, 22) : random(2.5, 8);
  }

  function shy(bug) {
    if (bug.startled > 0) return;
    bug.startled = 1.4;
    const away = Math.atan2(bug.y - pointer.y, bug.x - pointer.x);
    bug.target = clampToViewport(
      { x: bug.x + Math.cos(away) * 260, y: bug.y + Math.sin(away) * 260 },
      width,
      height,
    );
    bug.mode = 'fly';
  }

  function advance(bug, dt) {
    const flying = bug.mode === 'fly';
    // Altitude always eases towards where the bug wants to be, so a landing
    // settles smoothly instead of leaving it hovering in place.
    bug.lift += ((flying ? 1 : 0) - bug.lift) * Math.min(1, dt * 5.5);

    if (bug.mode === 'idle') {
      bug.wait -= dt;
      if (bug.wait <= 0) (Math.random() < 0.12 || party > 0 ? takeOff : walk)(bug);
      return;
    }

    const target = bug.target;
    const distance = Math.hypot(target.x - bug.x, target.y - bug.y);
    const boost = bug.startled > 0 ? 1.6 : 1;
    const speed = (flying ? settings.flySpeed : settings.walkSpeed) * boost;

    bug.heading = steer(
      bug.heading,
      Math.atan2(target.y - bug.y, target.x - bug.x),
      (flying ? settings.flyTurn : settings.walkTurn) * dt,
    );
    bug.wobble += dt * (flying ? 9 : 4.5);
    const sway = Math.sin(bug.wobble) * (flying ? 0.1 : 0.16);
    const step = speed * dt;
    bug.x += Math.cos(bug.heading + sway) * step;
    bug.y += Math.sin(bug.heading + sway) * step;
    Object.assign(bug, clampToViewport(bug, width, height));

    // The gait is driven by distance travelled, so the legs always match the
    // speed the bug is actually moving at.
    if (!flying) bug.gait += step / settings.strideLength;

    bug.sinceDot += step;
    const gap = flying ? settings.flyDotGap : settings.walkDotGap;
    if (bug.sinceDot >= gap) {
      bug.sinceDot = 0;
      dropDot(bug);
    }

    if (distance < settings.arriveRadius + (flying ? 18 : 0)) {
      if (flying && party > 0) takeOff(bug, { crossing: true });
      else rest(bug);
    }
  }

  function paint(bug) {
    const degrees = (bug.heading * 180) / Math.PI + 90;
    const lift = bug.lift;
    bug.node.setAttribute('transform', `translate(${bug.x.toFixed(1)} ${bug.y.toFixed(1)}) rotate(${degrees.toFixed(1)})`);
    bug.body.setAttribute('transform', `translate(0 ${(-8 * lift).toFixed(2)}) scale(${(bug.scale * (1 + lift * 0.14)).toFixed(3)})`);
    bug.shadow.setAttribute('opacity', (0.16 - lift * 0.09).toFixed(3));
    bug.shadow.setAttribute('transform', `scale(${(bug.scale * (1 - lift * 0.18)).toFixed(3)})`);

    // Two tripods, half a stride apart, folded away in flight.
    const swing = bug.mode === 'walk' ? settings.strideSwing * (1 - lift) : 0;
    bug.legs.forEach((leg, index) => {
      const [px, py] = LEGS[index].pivot;
      const angle = swing * Math.sin(bug.gait + LEGS[index].tripod * Math.PI);
      leg.setAttribute('transform', `rotate(${angle.toFixed(2)} ${px} ${py})`);
    });

    // Wings stay out until the bug has really landed. They are a CSS
    // animation, so this is the only switch they need.
    bug.node.classList.toggle('is-flying', bug.mode === 'fly' || lift > 0.12);
  }

  function tick(time) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
    lastTime = time;
    if (!dt) return;
    if (party > 0) party -= dt * 1000;

    const pointerFresh = time - pointer.at < 2600;
    for (const bug of bugs) {
      bug.startled = Math.max(0, bug.startled - dt);
      if (pointerFresh && Math.hypot(bug.x - pointer.x, bug.y - pointer.y) < settings.shyRadius) shy(bug);
      advance(bug, dt);
      paint(bug);
    }
  }

  function onPointerMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.at = performance.now();
  }

  function start() {
    if (frame !== null) return;
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
    addEventListener('pointermove', onPointerMove, { passive: true });
    addEventListener('resize', measure);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    removeEventListener('pointermove', onPointerMove);
    removeEventListener('resize', measure);
  }

  const controller = {
    /** Turn the colony on or off — used by the settings toggle. */
    setEnabled(value) {
      const next = value && !motionQuery.matches;
      if (next === enabled) return controller;
      enabled = next;
      if (!enabled) {
        stop();
        layer.remove();
        trailGroup.replaceChildren();
        bugGroup.replaceChildren();
        bugs = [];
        return controller;
      }
      mount.append(layer);
      measure();
      build();
      start();
      return controller;
    },

    /** A win: everyone takes off and leaves a trail of little hearts. */
    celebrate(duration = 6000) {
      if (!enabled) return controller;
      party = duration;
      for (const bug of bugs) takeOff(bug, { crossing: true });
      return controller;
    },

    /** Send the nearest bug over to an element — a love note just arrived. */
    flyTo(element) {
      if (!enabled || !element) return controller;
      const box = element.getBoundingClientRect();
      if (!box.width) return controller;
      const spot = clampToViewport(
        { x: box.left + box.width * random(0.25, 0.75), y: box.top + box.height * random(0.2, 0.6) },
        width,
        height,
      );
      const bug = bugs.reduce(
        (best, candidate) =>
          !best || Math.hypot(candidate.x - spot.x, candidate.y - spot.y) < Math.hypot(best.x - spot.x, best.y - spot.y)
            ? candidate
            : best,
        null,
      );
      if (!bug) return controller;
      bug.mode = 'fly';
      bug.target = spot;
      return controller;
    },

    get enabled() {
      return enabled;
    },

    destroy() {
      controller.setEnabled(false);
    },
  };

  motionQuery.addEventListener?.('change', () => {
    if (motionQuery.matches && enabled) controller.setEnabled(false);
  });

  return controller;
}
