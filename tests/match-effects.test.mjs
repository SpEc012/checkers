// The Rock Paper Scissors countdown and the words on the victory card.

import assert from 'node:assert/strict';
import { throwFrame, victoryCopy, THROW_DURATION } from '../public/match-effects.mjs';

// --- three full bounces, then the reveal ------------------------------------
for (let beat = 0; beat < 3; beat++) {
  assert.ok(throwFrame(beat * 0.72 + 0.36).bounce > 0.89, 'each beat lifts the hand');
  assert.ok(throwFrame(beat * 0.72 + 0.001).bounce < 0.001, 'and lands it again');
  assert.equal(throwFrame(beat * 0.72 + 0.36).blend, 0, 'the hand stays a fist until "shoot"');
}

assert.equal(throwFrame(2.6).blend, 1);
assert.equal(throwFrame(2.6).word, 'Shoot!');
assert.ok(THROW_DURATION >= 2600, 'the UI must wait for the whole countdown');

// --- reduced motion skips straight to the result ----------------------------
assert.equal(throwFrame(0.3, true).bounce, 0);
assert.equal(throwFrame(0.3, true).blend, 1);

// --- named wins, ties and cooperative results -------------------------------
const names = { rose: 'Dylan', cream: 'Audrey' };
for (const game of ['checkers', 'connect4', 'memory', 'rps']) {
  assert.equal(victoryCopy('cream', names, game).headline, 'Audrey');
}
assert.equal(victoryCopy('rose', { rose: 'Alex', cream: 'Sam' }, 'checkers').headline, 'Alex');
assert.equal(victoryCopy('together', names, 'puzzle').result, 'Win together!');
assert.equal(victoryCopy('draw', {}, 'memory').bang, 'JINX!');

console.log('Match effects: three full bounces, reveal timing, reduced motion, named wins, ties and cooperative results passed.');
