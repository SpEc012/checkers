// The lovebug motion helpers. These are the parts that decide where a bug
// goes; the drawing and the animation loop need a browser, so they are checked
// by eye instead.

import assert from 'node:assert/strict';
import { wrapAngle, steer, pickWaypoint, clampToViewport, settings } from '../public/lovebugs.mjs';

const TAU = Math.PI * 2;

// --- angles stay in -PI..PI -------------------------------------------------
for (const angle of [0, 3, -3, 7, -7, 12.5]) {
  const wrapped = wrapAngle(angle);
  assert.ok(wrapped >= -Math.PI - 1e-9 && wrapped <= Math.PI + 1e-9, `${angle} wrapped out of range`);
  assert.ok(Math.abs(Math.sin(wrapped) - Math.sin(angle)) < 1e-9, 'wrapping keeps the direction');
}

// --- steering turns the short way, and never faster than allowed ------------
assert.ok(Math.abs(steer(0, 0.2, 1) - 0.2) < 1e-9, 'a small turn arrives immediately');
assert.ok(Math.abs(steer(0, 3, 0.1) - 0.1) < 1e-9, 'a big turn is rationed');
assert.ok(steer(0.1, -0.1, 1) < 0.1, 'turns go towards the target');
assert.ok(steer(3.0, -3.0, 0.1) > 3.0, 'the short way to -3 from 3 crosses PI rather than turning back through zero');
assert.ok(Math.abs(wrapAngle(steer(3.0, -3.0, 1) + 3.0)) < 1e-9, 'a wide enough turn arrives in one step');
for (let from = -Math.PI; from < Math.PI; from += 0.37) {
  for (let to = -Math.PI; to < Math.PI; to += 0.53) {
    const turned = steer(from, to, 0.2);
    assert.ok(Math.abs(wrapAngle(turned - from)) <= 0.2 + 1e-9, 'the turn rate is a hard limit');
  }
}

// --- waypoints stay on the page ---------------------------------------------
const width = 1280;
const height = 800;
let hugged = 0;
for (let i = 0; i < 600; i++) {
  const point = pickWaypoint(width, height);
  assert.ok(point.x >= 0 && point.x <= width, 'waypoint inside the viewport horizontally');
  assert.ok(point.y >= 0 && point.y <= height, 'waypoint inside the viewport vertically');
  const margin = settings.edgeMargin;
  if (point.x <= margin || point.x >= width - margin || point.y <= margin || point.y >= height - margin) hugged++;
}
assert.ok(hugged === 600, 'walking bugs keep to the quiet margins of the page');

let crossed = 0;
for (let i = 0; i < 400; i++) {
  const point = pickWaypoint(width, height, { crossing: true });
  const margin = settings.edgeMargin;
  if (point.x > margin && point.x < width - margin && point.y > margin && point.y < height - margin) crossed++;
}
assert.ok(crossed === 400, 'a flight may cut across the middle');

// --- tiny viewports do not break the margin maths ---------------------------
for (const [w, h] of [[120, 90], [320, 568], [1, 1]]) {
  const point = pickWaypoint(w, h);
  assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `waypoint is a real point at ${w}x${h}`);
  assert.ok(point.x >= 0 && point.x <= w && point.y >= 0 && point.y <= h);
}

// --- clamping keeps a bug on screen -----------------------------------------
assert.deepEqual(clampToViewport({ x: -50, y: 5000 }, 800, 600), { x: 18, y: 582 });
assert.deepEqual(clampToViewport({ x: 400, y: 300 }, 800, 600), { x: 400, y: 300 });
assert.deepEqual(clampToViewport({ x: 900, y: -9 }, 800, 600, 0), { x: 800, y: 0 });

// --- the colony settles at a gentle pace ------------------------------------
assert.ok(settings.walkSpeed < 60, 'crawling should be easy to ignore');
assert.ok(settings.flySpeed > settings.walkSpeed * 3, 'flights are a real event');
assert.ok(settings.flyDotGap > settings.walkDotGap, 'a flight leaves a looser dotted trail');
assert.ok(settings.walkTurn > 0 && settings.walkTurn < TAU, 'turn rates are radians per second');

console.log('Lovebug motion passed: angle wrapping, rationed turns, margin-hugging waypoints, crossings and viewport clamping.');
