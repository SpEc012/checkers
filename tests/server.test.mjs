// The room API, driven end to end against a real SQLite database using the
// same migration D1 runs. Two players, three tokens, and every rule the server
// is responsible for: seats, passwords, turn order, stale revisions, secrets,
// agreed changes and closing the room.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api } from '../server/api.mjs';
import { moves } from '../public/engine.mjs';
import { newGame, dropHeart, placeTile } from '../public/arcade.mjs';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync('drizzle/0000_famous_selene.sql', 'utf8'));

/** The slice of the D1 client the Worker actually uses. */
const DB = {
  prepare(sql) {
    return {
      bind(...args) {
        const statement = sqlite.prepare(sql);
        return {
          async first() {
            return statement.get(...args) || null;
          },
          async all() {
            return { results: statement.all(...args) };
          },
          async run() {
            return { meta: statement.run(...args) };
          },
        };
      },
    };
  },
};

// Three players: A hosts, B is the guest, C is a stranger.
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);

async function call(path, body, token = A) {
  const response = await api(new Request(`https://game.test${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Player-Token': token,
      Origin: 'https://game.test',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), { DB });
  return { status: response.status, data: await response.json() };
}

/* -------------------------------------------------- a password-locked room */

let r = await call('/api/rooms', { name: 'A date', playerName: 'Dylan', pin: 'tulips', side: 'rose' });
assert.equal(r.status, 201);
let id = r.data.id;
const route = action => `/api/rooms/${id}/${action}`;

assert.equal(r.data.side, 'rose');
assert.equal((await call('/api/rooms')).data.rooms[0].locked, true, 'the lobby shows the lock, not the password');
assert.equal((await call(route('move'), { from: 40, to: 33, revision: 0 })).status, 409, 'no moves until someone joins');
assert.equal((await call(route('join'), { playerName: 'Audrey', pin: 'wrong' }, B)).status, 403);

r = await call(route('join'), { playerName: 'Audrey', pin: 'tulips' }, B);
assert.equal(r.status, 200);
assert.equal(r.data.side, 'cream');
assert.equal(r.data.names.cream, 'Audrey');

assert.equal((await call(route('join'), { pin: 'tulips' }, C)).status, 409, 'only two seats');
assert.equal((await call(route('sync'), {}, C)).status, 403, 'and no spectators');

/* ------------------------------------------------ turns, seats, revisions */

assert.equal((await call(route('move'), { from: 17, to: 24, revision: r.data.revision }, B)).status, 403, 'cream cannot open');

r = await call(route('sync'), {});
let move = moves(r.data.state)[0];
const stale = r.data.revision;
r = await call(route('move'), { ...move, revision: stale });
assert.equal(r.status, 200);
assert.equal(r.data.state.turn, 'cream');

const creamMove = moves(r.data.state)[0];
assert.equal((await call(route('move'), { ...creamMove, revision: r.data.revision })).status, 403, 'rose cannot move cream');
assert.equal((await call(route('move'), { ...creamMove, revision: stale }, B)).status, 409, 'a stale revision is rejected');

r = await call(route('move'), { ...creamMove, revision: r.data.revision }, B);
assert.equal(r.status, 200);
assert.equal(r.data.state.ply, 2);

/* ------------------------------------------------------- chat and rematch */

r = await call(route('chat'), { text: 'Love you <script>not HTML</script>' });
assert.equal(r.status, 200);
assert.equal(
  (await call(route('sync'), {}, B)).data.messages[0].text,
  'Love you <script>not HTML</script>',
  'message text is stored verbatim and rendered as text',
);

r = await call(route('rematch'), {});
assert.equal(r.data.rematch, 'rose');
assert.equal((await call(route('rematch'), { accept: true })).status, 400, 'you cannot accept your own request');
r = await call(route('rematch'), { accept: true }, B);
assert.equal(r.data.state.ply, 0);
assert.equal((await call(route('sync'), {})).data.side, 'rose', 'seats survive a rematch');

/* --------------------------------------------- offline partner, then close */

sqlite.prepare('UPDATE rooms SET guest_seen=? WHERE id=?').run(Date.now() - 60000, id);
r = await call(route('sync'), {});
move = moves(r.data.state)[0];
assert.equal((await call(route('move'), { ...move, revision: r.data.revision })).status, 409, 'play pauses while a partner is away');

await call(route('leave'), {}, B);
assert.equal((await call('/api/rooms')).data.rooms.length, 0);
assert.equal((await call(route('sync'), {})).status, 410, 'leaving ends the room for both');

/* ------------------------------------- a second room, hosted as cream, and
                                          the other five games               */

r = await call('/api/rooms', { playerName: 'Audrey', side: 'cream' });
id = r.data.id;
assert.equal(r.data.side, 'cream');
r = await call(route('join'), { playerName: 'Dylan' }, B);
assert.equal(r.data.side, 'rose');
move = moves(r.data.state)[0];
r = await call(route('move'), { ...move, revision: r.data.revision }, B);
assert.equal(r.status, 200);

// Switching games needs both players, and keeps the room.
r = await call(route('switch'), { game: 'connect4' });
assert.equal(r.data.state.switchRequest.game, 'connect4');
assert.equal((await call(route('switch'), { accept: true })).status, 400, 'you cannot accept your own invitation');
r = await call(route('switch'), { accept: true }, B);
assert.equal(r.data.state.game, 'connect4');

assert.equal((await call(route('play'), { column: 0, revision: r.data.revision })).status, 400, 'cream is not on move');
r = await call(route('play'), { column: 0, revision: r.data.revision }, B);
assert.equal(r.status, 200);
assert.equal(r.data.state.board[35], 'rose');

// Draw & Guess: B owns rose and is the artist, A must never receive the word.
await call(route('switch'), { game: 'draw' });
r = await call(route('switch'), { accept: true }, B);
assert.equal(r.data.state.game, 'draw');

const secret = r.data.state.word;
assert.ok(secret);
let hidden = await call(route('sync'), {});
assert.equal(hidden.data.state.word, null, 'the guesser never sees the prompt');
assert.ok(hidden.data.state.letters, 'only its shape');

assert.equal(
  (await call(route('play'), { action: 'stroke', points: [[0, 0]], color: '#000000', width: 7, revision: hidden.data.revision })).status,
  400,
  'only the artist can draw',
);
r = await call(route('play'), { action: 'stroke', points: [[0, 0], [1, 1]], color: '#000000', width: 7, revision: hidden.data.revision }, B);
assert.equal(r.status, 200);

r = await call(route('play'), { action: 'guess', text: secret, revision: r.data.revision });
assert.equal(r.data.state.winner, 'together');
r = await call(route('play'), { action: 'next', revision: r.data.revision });
assert.equal(r.data.state.turn, 'cream', 'the artist alternates');
assert.ok(r.data.state.word);
assert.equal((await call(route('sync'), {}, B)).data.state.word, null);

// Photo Puzzle: cooperative placement, and photos are seat-only.
await call(route('switch'), { game: 'puzzle' });
r = await call(route('switch'), { accept: true }, B);
r = await call(route('play'), { piece: 0, target: 0, revision: r.data.revision });
assert.equal(r.data.state.board[0], 0);
r = await call(route('play'), { piece: 1, target: 1, revision: r.data.revision }, B);
assert.equal(r.data.state.board[1], 1);
assert.equal((await call(route('photo-read'), {}, C)).status, 403);

// The pure rules behind those two boards.
let four = newGame('connect4');
for (const column of [0, 1, 0, 1, 0, 1, 0]) four = dropHeart(four, column, four.turn);
assert.equal(four.winner, 'rose');
assert.equal(dropHeart(four, 2, four.turn), null, 'a finished board takes no more hearts');

let puzzle = newGame('puzzle');
assert.equal(placeTile(puzzle, 1, 0), null);
for (let piece = 0; piece < 16; piece++) puzzle = placeTile(puzzle, piece, piece);
assert.equal(puzzle.winner, 'together');

console.log('Arcade checks passed: agreed switches, Connect Four win, secret prompt privacy, drawing ownership, guesses, alternating rounds and cooperative puzzle completion.');

// Puzzle difficulty is agreed the same way a game switch is.
await call(route('puzzle-config'), { config: { size: 8, cut: 'triangles', rotate: true, peek: false } });
assert.equal((await call(route('puzzle-config'), { accept: true })).status, 400);
r = await call(route('puzzle-config'), { accept: true }, B);
assert.equal(r.data.state.board.length, 128);
assert.equal(r.data.state.config.peek, false);

// Memory Match and Rock Paper Scissors keep their hidden information.
for (const game of ['memory', 'rps']) {
  await call(route('switch'), { game });
  r = await call(route('switch'), { accept: true }, B);
  assert.equal(r.data.state.game, game);

  if (game === 'memory') {
    assert.ok(r.data.state.deck.every(face => face === null), 'the deck starts face down');
    assert.equal((await call(route('play'), { index: 0, revision: r.data.revision })).status, 400);
    assert.equal((await call(route('play'), { index: 0, revision: r.data.revision }, B)).status, 200);
  }

  if (game === 'rps') {
    r = await call(route('play'), { choice: 'paper', revision: r.data.revision }, B);
    const opponent = await call(route('sync'), {});
    assert.equal(opponent.data.state.picks.rose, null, 'a locked choice stays secret');
    assert.equal(opponent.data.state.opponentPicked, true);
    r = await call(route('play'), { choice: 'rock', revision: r.data.revision });
    assert.equal(r.data.state.roundResult, 'rose');
  }
}

console.log('Room API checks passed for new games and agreed puzzle configuration.');
sqlite.close();
console.log('Two-player server checks passed: lobby, passwords, seat ownership, illegal turns, stale moves, chat, rematches, offline pause and room closure.');
