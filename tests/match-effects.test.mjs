// The Rock Paper Scissors countdown and the words on the victory card.

import assert from 'node:assert/strict';
import { throwFrame, fingerOpen, victoryCopy, THROW_DURATION } from '../public/match-effects.mjs';

// --- three full bounces, then the reveal ------------------------------------
for (let beat = 0; beat < 3; beat++) {
  assert.ok(throwFrame(beat * 0.72 + 0.36).bounce > 0.89, 'each beat lifts the hand');
  assert.ok(throwFrame(beat * 0.72 + 0.001).bounce < 0.001, 'and lands it again');
  assert.equal(throwFrame(beat * 0.72 + 0.36).blend, 0, 'the hand stays a fist until "shoot"');
}

assert.equal(throwFrame(2.6).blend, 1);
assert.equal(throwFrame(2.6).word, 'Shoot!');
assert.ok(THROW_DURATION >= 2600, 'the UI must wait for the whole countdown');

// --- the wrist leads the bounce, and the hand settles afterwards ------------
assert.equal(throwFrame(0).wrist, 0, 'the wrist starts level');
assert.ok(throwFrame(0.18).wrist > 0.2, 'it rolls a quarter beat ahead of the drop');
assert.ok(throwFrame(0.54).wrist < -0.2, 'and unwinds on the way back up');
assert.equal(throwFrame(1).snap, 0, 'no snap during the countdown');
assert.equal(throwFrame(1).settle, 0);
assert.ok(throwFrame(2.3).snap > 0.5, 'the shape overshoots just after "shoot"');
assert.ok(throwFrame(3.2).snap === 0, 'and the overshoot is spent');
assert.ok(Math.abs(throwFrame(3.5).settle) < 0.01, 'the wobble dies away');
assert.equal(throwFrame(1).beat, 1);
assert.equal(throwFrame(2.5).beat, 3);

// --- fingers unfurl one after another ---------------------------------------
assert.equal(fingerOpen(0, 0), 0);
assert.equal(fingerOpen(0, 3), 0);
assert.ok(fingerOpen(0.1, 0) > fingerOpen(0.1, 1), 'the index leads');
assert.ok(fingerOpen(0.1, 1) > fingerOpen(0.1, 3), 'the pinky is last');
assert.equal(fingerOpen(1, 3), 1, 'everything is open well before the card shows');
for (let i = 0; i < 4; i++) {
  for (let t = 0; t <= 1; t += 0.05) {
    const value = fingerOpen(t, i);
    assert.ok(value >= 0 && value <= 1, 'openness stays in range');
  }
}

// --- reduced motion skips straight to the result ----------------------------
assert.equal(throwFrame(0.3, true).bounce, 0);
assert.equal(throwFrame(0.3, true).blend, 1);
assert.equal(throwFrame(0.3, true).wrist, 0);
assert.equal(throwFrame(0.3, true).snap, 0);
assert.equal(fingerOpen(throwFrame(0.3, true).sinceShoot, 3), 1, 'and to an open hand');

// --- named wins, ties and cooperative results -------------------------------
const names = { rose: 'Dylan', cream: 'Audrey' };
for (const game of ['checkers', 'connect4', 'memory', 'rps']) {
  assert.equal(victoryCopy('cream', names, game).headline, 'Audrey');
}
assert.equal(victoryCopy('rose', { rose: 'Alex', cream: 'Sam' }, 'checkers').headline, 'Alex');
assert.equal(victoryCopy('together', names, 'puzzle').result, 'Win together!');
assert.equal(victoryCopy('draw', {}, 'memory').bang, 'JINX!');

console.log('Match effects: three full bounces, wrist roll, snap and settle, staggered fingers, reduced motion, named wins, ties and cooperative results passed.');
