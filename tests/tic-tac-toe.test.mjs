import assert from 'node:assert/strict';
import { newGame, placeMark } from '../public/arcade.mjs';

const blank = newGame('tictactoe');
for (const index of [-1, 9, 1.5, '0', null, undefined]) assert.equal(placeMark(blank, index, 'rose'), null);
assert.equal(placeMark(blank, 0, 'cream'), null);
const one = placeMark(blank, 0, 'rose');
assert.equal(blank.board[0], null, 'moves do not mutate the shared snapshot');
assert.equal(placeMark(one, 0, 'cream'), null, 'occupied tiles cannot be replaced');
assert.equal(placeMark(newGame('connect4'), 0, 'rose'), null);

// Every possible completed legal game: catches all lines, both winners,
// full-board wins, ties and accepting moves after a result.
const totals = { rose: 0, cream: 0, draw: 0 };
function walk(state) {
  if (state.winner) {
    totals[state.winner]++;
    assert.equal(placeMark(state, 0, state.turn), null);
    if (state.winner === 'draw') assert.ok(state.board.every(Boolean));
    else {
      assert.equal(state.winning.length, 3);
      assert.ok(state.winning.every(i => state.board[i] === state.winner));
    }
    return;
  }
  for (let i = 0; i < 9; i++) if (!state.board[i]) walk(placeMark(state, i, state.turn));
}
walk(blank);
assert.deepEqual(totals, { rose: 131184, cream: 77904, draw: 46080 });
console.log('Tic Tac Toe: all 255,168 completed games, ties, turn ownership and illegal moves passed.');
