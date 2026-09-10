import assert from 'node:assert/strict';
import {throwFrame,victoryCopy,THROW_DURATION} from '../public/match-effects.mjs';
for(let beat=0;beat<3;beat++){
 assert.ok(throwFrame(beat*.72+.36).bounce>.89);
 assert.ok(throwFrame(beat*.72+.001).bounce<.001);
 assert.equal(throwFrame(beat*.72+.36).blend,0);
}
assert.equal(throwFrame(2.6).blend,1);assert.equal(throwFrame(2.6).word,'Shoot!');assert.ok(THROW_DURATION>=2600);
assert.equal(throwFrame(.3,true).bounce,0);assert.equal(throwFrame(.3,true).blend,1);
for(const game of ['checkers','connect4','memory','rps'])assert.equal(victoryCopy('cream',{rose:'Dylan',cream:'Audrey'},game).headline,'Audrey');
assert.equal(victoryCopy('rose',{rose:'Alex',cream:'Sam'},'checkers').headline,'Alex');
assert.equal(victoryCopy('together',{rose:'Dylan',cream:'Audrey'},'puzzle').result,'Win together!');
assert.equal(victoryCopy('draw',{},'memory').bang,'JINX!');
console.log('Match effects: three full bounces, reveal timing, reduced motion, named wins, ties and cooperative results passed.');
