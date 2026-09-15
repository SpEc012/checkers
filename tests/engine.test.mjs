// Checkers rules: openings, mandatory captures, chained jumps, crowning, wins,
// plus fifty random games to prove the engine never gets stuck.

import assert from 'node:assert/strict';
import { initial, moves, apply } from '../public/engine.mjs';

const empty = () => {
  const state = initial();
  state.board.fill(null);
  return state;
};

// --- the opening position --------------------------------------------------
let state = initial();
assert.equal(state.board.filter(Boolean).length, 24);
assert.equal(moves(state).length, 7);
assert.equal(apply(state, 40, 24), null, 'pieces move one square at a time');

const first = moves(state)[0];
let next = apply(state, first.from, first.to);
assert.equal(next.turn, 'cream');
assert.equal(state.ply, 0, 'apply must not mutate the state it was given');

// --- captures are mandatory, and chain -------------------------------------
state = empty();
state.board[42] = { side: 'rose', king: false };
state.board[35] = { side: 'cream', king: false };
state.board[21] = { side: 'cream', king: false };
state.board[1] = { side: 'cream', king: false };
assert.deepEqual(moves(state), [{ from: 42, to: 28, capture: 35 }], 'the jump hides every plain move');

next = apply(state, 42, 28);
assert.equal(next.forced, 28, 'the same piece must finish the chain');
assert.equal(next.turn, 'rose');
next = apply(next, 28, 14);
assert.equal(next.forced, null);
assert.equal(next.turn, 'cream');

// --- crowning ends the turn ------------------------------------------------
state = empty();
state.board[17] = { side: 'rose', king: false };
state.board[10] = { side: 'cream', king: false };
state.board[12] = { side: 'cream', king: false };
next = apply(state, 17, 3);
assert.equal(next.board[3].king, true);
assert.equal(next.turn, 'cream');
assert.equal(next.forced, null);

// --- kings move both ways --------------------------------------------------
state = empty();
state.board[26] = { side: 'rose', king: true };
state.board[63] = { side: 'cream', king: true };
assert.equal(moves(state).length, 4);

// --- taking the last piece wins --------------------------------------------
state = empty();
state.board[42] = { side: 'rose', king: false };
state.board[35] = { side: 'cream', king: false };
assert.equal(apply(state, 42, 28).winner, 'rose');

// --- fifty random games ----------------------------------------------------
for (let game = 0; game < 50; game++) {
  state = initial();
  for (let turn = 0; turn < 1000 && !state.winner; turn++) {
    const options = moves(state);
    assert.ok(options.length, 'a game without a winner always has a move');
    const move = options[Math.floor(Math.random() * options.length)];
    const before = state.board.filter(Boolean).length;
    next = apply(state, move.from, move.to);
    assert.ok(next);
    assert.equal(next.board.filter(Boolean).length, before - (move.capture !== undefined ? 1 : 0));
    state = next;
  }
}

console.log('Rules tests and 50 simulated games passed.');
