// The Rock Paper Scissors countdown and the words on the victory card.

import assert from 'node:assert/strict';
import { throwFrame, armPose, victoryCopy, THROW_DURATION } from '../public/match-effects.mjs';

// Each beat winds up slowly and drives down quickly around a fixed elbow.
for(let beat=0;beat<3;beat++){
 const t=beat*.72;
 assert.ok(throwFrame(t+.72*.51).swing>.69);
 assert.ok(throwFrame(t+.72*.76).swing<-.09);
 assert.equal(throwFrame(t+.36).blend,0);
 for(const phase of [0,.2,.4,.55,.7]){
  const frame=throwFrame(t+phase),left=armPose('rose',frame),right=armPose('cream',frame);
  assert.equal(left.y,-.3);assert.equal(right.y,-.3);
  assert.equal(left.x,-right.x);assert.equal(left.angle,-right.angle);
  assert.equal(frame.bounce,0);
 }
}
assert.ok(throwFrame(2.4).reach>.27,'the reveal extends toward the opponent');
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

console.log('Match effects: fixed forearm pivots, mirrored downstrokes, reveal timing, reduced motion, named wins, ties and cooperative results passed.');
