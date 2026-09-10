// Puzzle cuts and rotation, Memory Match privacy and scoring, and the secret
// throws behind Rock Paper Scissors.

import assert from 'node:assert/strict';
import {
  newGame, puzzleAction, puzzleOptions, placeTile, memoryAction, rpsAction, publicGame,
} from '../public/arcade.mjs';

// --- every puzzle size and cut style completes ------------------------------
for (const size of [3, 4, 6, 8]) {
  for (const cut of ['squares', 'triangles']) {
    let puzzle = newGame('puzzle', { size, cut, rotate: true, peek: false });
    const count = size * size * (cut === 'triangles' ? 2 : 1);
    assert.equal(puzzle.board.length, count);
    assert.equal(new Set(puzzle.tray).size, count, 'every piece appears once');
    assert.equal(puzzle.config.peek, false);

    // A rotated piece will not sit down until it is upright again.
    puzzle.rotations[0] = 1;
    assert.equal(placeTile(puzzle, 0, 0), null);
    for (let turn = 0; turn < 3; turn++) puzzle = puzzleAction(puzzle, { action: 'rotate', piece: 0 });
    assert.equal(puzzle.rotations[0], 0);

    puzzle = placeTile(puzzle, 0, 0);
    assert.equal(puzzle.board[0], 0);
    assert.equal(placeTile(puzzle, 0, 0), null, 'a placed square cannot be filled twice');

    for (let piece = 1; piece < count; piece++) {
      puzzle.rotations[piece] = 0;
      puzzle = placeTile(puzzle, piece, piece);
    }
    assert.equal(puzzle.winner, 'together');
  }
}

assert.deepEqual(
  puzzleOptions({ size: 500, cut: 'bad', rotate: 'yes' }),
  { size: 4, cut: 'squares', rotate: false, peek: true },
  'nonsense options fall back to the classic puzzle',
);

// --- memory match: hidden faces, timed reveal, extra turns ------------------
let memory = newGame('memory');
memory.deck = ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd', 'e', 'e', 'f', 'f', 'g', 'g', 'h', 'h'];
assert.ok(publicGame(memory, 'rose').deck.every(face => face === null), 'face-down cards stay secret');
assert.equal(memoryAction(memory, 0, 'cream'), null, 'only the player to move may flip');

memory = memoryAction(memory, 0, 'rose', 1000);
assert.equal(publicGame(memory, 'cream', 1000).deck[0], 'a');
assert.equal(memoryAction(memory, 0, 'rose', 1000), null, 'the same card cannot be flipped twice');

memory = memoryAction(memory, 2, 'rose', 1000);
assert.equal(memory.turn, 'cream', 'a mismatch hands over the turn');
assert.equal(memoryAction(memory, 1, 'cream', 1100), null, 'the pair stays up while it is being read');
assert.equal(publicGame(memory, 'cream', 1100).deck[2], 'b');
assert.ok(publicGame(memory, 'cream', 2500).deck.every(face => face === null), 'then it flips back');

memory = memoryAction(memory, 0, 'cream', 2500);
memory = memoryAction(memory, 1, 'cream', 2500);
assert.equal(memory.points.cream, 1);
assert.equal(memory.turn, 'cream', 'a match earns another turn');
assert.equal(memory.matched[0], 'cream');
for (let card = 2; card < 16; card += 2) {
  memory = memoryAction(memory, card, 'cream', 3000);
  memory = memoryAction(memory, card + 1, 'cream', 3000);
}
assert.equal(memory.winner, 'cream');

// --- rock paper scissors: locked choices, first to three --------------------
let throws = newGame('rps');
throws = rpsAction(throws, { choice: 'rock' }, 'rose');
assert.equal(publicGame(throws, 'cream').picks.rose, null, 'a pending choice is redacted');
assert.equal(publicGame(throws, 'cream').opponentPicked, true, 'but the opponent knows it was made');
assert.equal(rpsAction(throws, { choice: 'paper' }, 'rose'), null, 'no changing your mind');
assert.equal(rpsAction(throws, { action: 'next' }, 'cream'), null, 'no skipping an open round');

throws = rpsAction(throws, { choice: 'scissors' }, 'cream');
assert.equal(throws.roundResult, 'rose');
assert.equal(publicGame(throws, 'cream').picks.rose, 'rock', 'the reveal shows both hands');

for (let round = 0; round < 2; round++) {
  throws = rpsAction(throws, { action: 'next' }, 'cream');
  throws = rpsAction(throws, { choice: 'paper' }, 'cream');
  throws = rpsAction(throws, { choice: 'scissors' }, 'rose');
}
assert.equal(throws.winner, 'rose');
assert.equal(throws.points.rose, 3);
assert.equal(rpsAction(throws, { action: 'next' }, 'rose'), null, 'the match is over');

console.log('Expansion checks passed: puzzle cuts/rotation/completion, memory privacy/timing/scoring, secret throws and first-to-three wins.');
