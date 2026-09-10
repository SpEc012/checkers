// Lovebugs: the little ladybugs that live on the page.
//
// One fixed SVG layer holds every bug. Each bug wanders the quiet margins of
// the viewport, leaves a fading dotted trail behind it, occasionally opens its
// wings for a short flight, and shies away from the pointer. The same drawing
// is reused for the small decorative bugs tucked into the layout, so there is
// exactly one lovebug in the codebase.
//
// Nothing here touches the DOM until a function is called, so the pure motion
// helpers below can be unit tested in Node.

const SVG_NS = 'http://www.w3.org/2000/svg';

export const settings = {
  edgeMargin: 74, // how far from the viewport edge the bugs like to stay
  walkSpeed: 27, // px per second — a slow, unhurried crawl
  flySpeed: 168,
  walkTurn: 2.4, // radians per second
  flyTurn: 3.4,
  walkDotGap: 11, // px between trail dots
  flyDotGap: 26,
  dotLife: 3400, // ms before a trail dot has faded away
  shyRadius: 96,
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

/**
 * Pick somewhere to go. Bugs prefer the margins of the page so they stay out
 * of the way of the board, but a flight may cut straight across the middle.
 */
export function pickWaypoint(width, height, { random = Math.random, crossing = false } = {}) {
  const margin = Math.min(settings.edgeMargin, width / 3, height / 3);
  if (crossing) {
    return {
      x: margin + random() * Math.max(1, width - margin * 2),
      y: margin + random() * Math.max(1, height - margin * 2),
    };
  }
  const alongTop = random() < 0.5;
  const nearStart = random() < 0.5;
  const band = () => (nearStart ? random() * margin : height - random() * margin);
  const bandX = () => (nearStart ? random() * margin : width - random() * margin);
  return alongTop
    ? { x: random() * width, y: band() }
    : { x: bandX(), y: random() * height };
}

/** Keep a point inside the viewport with a little breathing room. */
export function clampToViewport(point, width, height, pad = 18) {
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

/** Shared gradients and filters, defined once per document. */
function ensureDefs() {
  if (document.getElementById('lovebug-defs')) return;
  const defs = el('defs', {}, [
    el('radialGradient', { id: 'lovebug-shell', cx: '34%', cy: '28%', r: '78%' }, [
      el('stop', { offset: '0', 'stop-color': '#f6819c' }),
      el('stop', { offset: '0.55', 'stop-color': '#df4a6f' }),
      el('stop', { offset: '1', 'stop-color': '#ab2748' }),
    ]),
    el('radialGradient', { id: 'lovebug-wing', cx: '40%', cy: '30%', r: '80%' }, [
      el('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.85' }),
      el('stop', { offset: '1', 'stop-color': '#ffd7e4', 'stop-opacity': '0.35' }),
    ]),
  ]);
  const host = el('svg', { id: 'lovebug-defs', width: '0', height: '0', 'aria-hidden': 'true' }, [defs]);
  host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  document.body.prepend(host);
}

/**
 * Build one lovebug, drawn facing up in a 32 x 32 box centred on the origin.
 * The caller positions it with a transform.
 */
export function drawLovebug({ className = '' } = {}) {
  ensureDefs();
  const ink = '#3b2130';

  // Two alternating tripods, the way a real beetle scuttles.
  const legs = el('g', { class: 'lovebug-legs' }, [
    el('g', { class: 'lovebug-leg-set lovebug-leg-a' }, [
      el('path', { d: 'M-7.6-4-10.6-7M8 0.2 11.4 0.8M-7.6 4.6-10.4 7.4' }),
    ]),
    el('g', { class: 'lovebug-leg-set lovebug-leg-b' }, [
      el('path', { d: 'M7.6-4 10.6-7M-8 0.2-11.4 0.8M7.6 4.6 10.4 7.4' }),
    ]),
  ]);

  const wings = el('g', { class: 'lovebug-wings' }, [
    el('ellipse', { class: 'lovebug-wing lovebug-wing-left', cx: '-9', cy: '2', rx: '10', ry: '5.2', fill: 'url(#lovebug-wing)' }),
    el('ellipse', { class: 'lovebug-wing lovebug-wing-right', cx: '9', cy: '2', rx: '10', ry: '5.2', fill: 'url(#lovebug-wing)' }),
  ]);

  const shell = el('g', { class: 'lovebug-shell' }, [
    el('ellipse', { cx: '0', cy: '1.5', rx: '10.2', ry: '9.6', fill: 'url(#lovebug-shell)' }),
    el('rect', { x: '-0.6', y: '-7', width: '1.2', height: '17.6', rx: '0.6', fill: '#66162f', opacity: '0.5' }),
    el('ellipse', { cx: '-5.6', cy: '-1.6', rx: '2.1', ry: '2', fill: ink }),
    el('ellipse', { cx: '5.6', cy: '-1.6', rx: '2.1', ry: '2', fill: ink }),
    el('path', { d: HEART_D, fill: ink, transform: 'translate(0 3.6) scale(0.95)' }),
    el('ellipse', { cx: '-6.6', cy: '6', rx: '1.5', ry: '1.4', fill: ink }),
    el('ellipse', { cx: '6.6', cy: '6', rx: '1.5', ry: '1.4', fill: ink }),
    el('ellipse', { cx: '-5.4', cy: '-5.4', rx: '3.1', ry: '1.2', fill: '#ffffff', opacity: '0.22', transform: 'rotate(-38 -5.4 -5.4)' }),
  ]);

  const head = el('g', { class: 'lovebug-head' }, [
    el('ellipse', { cx: '0', cy: '-8.6', rx: '5.9', ry: '5.5', fill: ink }),
    el('ellipse', { cx: '-2.5', cy: '-9.4', rx: '1.75', ry: '1.85', fill: '#fffdfb' }),
    el('ellipse', { cx: '2.5', cy: '-9.4', rx: '1.75', ry: '1.85', fill: '#fffdfb' }),
    el('ellipse', { cx: '-2.2', cy: '-8.9', rx: '0.85', ry: '0.9', fill: ink }),
    el('ellipse', { cx: '2.8', cy: '-8.9', rx: '0.85', ry: '0.9', fill: ink }),
    el('ellipse', { cx: '-3.5', cy: '-6.6', rx: '1.3', ry: '0.8', fill: '#f6819c', opacity: '0.55' }),
    el('ellipse', { cx: '3.5', cy: '-6.6', rx: '1.3', ry: '0.8', fill: '#f6819c', opacity: '0.55' }),
  ]);

  const antennae = el('g', { class: 'lovebug-antennae' }, [
    el('path', { d: 'M-2.8-12.4-4.8-15.8M2.8-12.4 4.8-15.8' }),
    el('circle', { cx: '-5.4', cy: '-16.6', r: '1.35', fill: ink }),
    el('circle', { cx: '5.4', cy: '-16.6', r: '1.35', fill: ink }),
  ]);

  const body = el('g', { class: 'lovebug-body' }, [legs, wings, shell, head, antennae]);
  const shadow = el('ellipse', { class: 'lovebug-shadow', cx: '0', cy: '6', rx: '9', ry: '3.4', opacity: '0.18' });
  return el('g', { class: `lovebug ${className}`.trim() }, [shadow, body]);
}

/** Drop a ready-made bug into a decorative slot in the layout. */
export function decorate(host, { size = 26, tilt = 0 } = {}) {
  const svg = el('svg', { class: 'lovebug-decor', viewBox: '-16 -18 32 36', width: size, height: size * 1.125, 'aria-hidden': 'true' }, [
    drawLovebug({ className: 'lovebug-resting' }),
  ]);
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
export function createLovebugs({ count = 3, mount = document.body } = {}) {
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

  // Start the colony spread around the page rather than bunched together.
  const NESTS = [
    { x: 0.1, y: 0.22 },
    { x: 0.9, y: 0.34 },
    { x: 0.5, y: 0.88 },
    { x: 0.08, y: 0.74 },
  ];

  function spawn(index) {
    const nest = NESTS[index % NESTS.length];
    const start = clampToViewport(
      { x: width * nest.x + random(-30, 30), y: height * nest.y + random(-30, 30) },
      width,
      height,
    );
    return {
      ...start,
      node: null,
      heading: random(-Math.PI, Math.PI),
      target: pickWaypoint(width, height),
      mode: 'idle',
      wait: random(0.4, 2.6) + index * 0.35,
      lift: 0,
      scale: random(0.82, 1.12),
      wobble: random(0, Math.PI * 2),
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
      bugGroup.append(bug.node);
      return bug;
    });
  }

  /** Leave one dot of the dotted path the bug is walking (or flying) along. */
  function dropDot(bug) {
    const flying = bug.lift > 0.25;
    // The wrapper holds the position so the fade may animate `transform`.
    const dot = party > 0
      ? el('path', { class: 'lovebug-dot lovebug-dot-heart', d: HEART_D })
      : el('circle', { class: 'lovebug-dot', cx: '0', cy: '0', r: flying ? 2 : 3 });
    if (flying) dot.classList.add('lovebug-dot-air');
    const spin = party > 0 ? ` rotate(${random(-25, 25)})` : '';
    trailGroup.append(el('g', { transform: `translate(${bug.x.toFixed(1)} ${bug.y.toFixed(1)})${spin}` }, [dot]));

    // Hold the dot for a moment so the path reads, then let it fade away.
    const peak = flying ? 0.5 : 0.72;
    const animation = dot.animate(
      [
        { opacity: 0, transform: 'scale(.4)', offset: 0 },
        { opacity: peak, transform: 'scale(1)', offset: 0.08 },
        { opacity: peak * 0.8, transform: 'scale(1)', offset: 0.45 },
        { opacity: 0, transform: 'scale(.35)', offset: 1 },
      ],
      { duration: settings.dotLife, easing: 'ease-out', fill: 'forwards' },
    );
    const clear = () => dot.parentNode?.remove();
    if (animation) animation.addEventListener('finish', clear, { once: true });
    else setTimeout(clear, settings.dotLife);
  }

  function takeOff(bug, { crossing = true } = {}) {
    bug.mode = 'fly';
    bug.target = clampToViewport(pickWaypoint(width, height, { crossing }), width, height);
  }

  function walk(bug) {
    bug.mode = 'walk';
    bug.target = clampToViewport(pickWaypoint(width, height), width, height);
  }

  function rest(bug) {
    bug.mode = 'idle';
    bug.wait = random(1.4, 5.5);
  }

  function shy(bug) {
    if (bug.startled > 0) return;
    bug.startled = 1.6;
    const away = Math.atan2(bug.y - pointer.y, bug.x - pointer.x);
    bug.target = clampToViewport(
      { x: bug.x + Math.cos(away) * 320, y: bug.y + Math.sin(away) * 320 },
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
      if (bug.wait <= 0) (Math.random() < 0.34 || party > 0 ? takeOff : walk)(bug);
      return;
    }

    const target = bug.target;
    const distance = Math.hypot(target.x - bug.x, target.y - bug.y);
    const boost = bug.startled > 0 ? 1.5 : 1;
    const speed = (flying ? settings.flySpeed : settings.walkSpeed) * boost;

    bug.heading = steer(
      bug.heading,
      Math.atan2(target.y - bug.y, target.x - bug.x),
      (flying ? settings.flyTurn : settings.walkTurn) * dt,
    );
    bug.wobble += dt * (flying ? 9 : 5.5);
    const sway = Math.sin(bug.wobble) * (flying ? 0.12 : 0.2);
    const step = speed * dt;
    bug.x += Math.cos(bug.heading + sway) * step;
    bug.y += Math.sin(bug.heading + sway) * step;
    Object.assign(bug, clampToViewport(bug, width, height, 14));

    bug.sinceDot += step;
    const gap = flying ? settings.flyDotGap : settings.walkDotGap;
    if (bug.sinceDot >= gap) {
      bug.sinceDot = 0;
      dropDot(bug);
    }

    if (distance < settings.arriveRadius + (flying ? 18 : 0)) {
      if (flying && party > 0) takeOff(bug);
      else rest(bug);
    }
  }

  function paint(bug) {
    const degrees = (bug.heading * 180) / Math.PI + 90;
    const lift = bug.lift;
    bug.node.setAttribute('transform', `translate(${bug.x.toFixed(1)} ${bug.y.toFixed(1)}) rotate(${degrees.toFixed(1)})`);
    bug.body.setAttribute('transform', `translate(0 ${(-9 * lift).toFixed(2)}) scale(${(bug.scale * (1 + lift * 0.16)).toFixed(3)})`);
    bug.shadow.setAttribute('opacity', (0.2 - lift * 0.1).toFixed(3));
    bug.shadow.setAttribute('transform', `scale(${(bug.scale * (1 - lift * 0.18)).toFixed(3)})`);
    // Wings stay out until the bug has really landed; legs only scuttle on the
    // ground. Both are CSS animations, so this is the only switch they need.
    bug.node.classList.toggle('is-flying', bug.mode === 'fly' || lift > 0.12);
    bug.node.classList.toggle('is-walking', bug.mode === 'walk' && lift < 0.2);
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
      for (const bug of bugs) takeOff(bug);
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
