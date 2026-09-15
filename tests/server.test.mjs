// The room API, driven end to end against a real SQLite database using the
// same migration D1 runs. Two players, three tokens, and every rule the server
// is responsible for: seats, passwords, turn order, stale revisions, secrets,
// agreed changes and closing the room.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api } from '../server/api.mjs';
import { moves } from '../public/engine.mjs';
import { newGame, dropHeart, placeTile, RACE } from '../public/arcade.mjs';

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
// Two independent sessions play a full Tic Tac Toe round, then agree a rematch.
r = await call('/api/rooms', { name: 'Hearts and daisies', playerName: 'Dylan', game: 'tictactoe', side: 'rose' });
id = r.data.id;
r = await call(route('join'), { playerName: 'Audrey' }, B);
assert.equal(r.data.state.game, 'tictactoe');
assert.equal((await call(route('play'), { index: 0, revision: r.data.revision, side: 'rose' }, B)).status, 400, 'body cannot impersonate the other seat');
for (const [step, index] of [0, 3, 1, 4, 2].entries()) {
  const previous = r.data.revision;
  r = await call(route('play'), { index, revision: previous }, step % 2 ? B : A);
  assert.equal(r.status, 200);
  const peer = await call(route('sync'), {}, step % 2 ? A : B);
  assert.deepEqual(peer.data.state.board, r.data.state.board);
  assert.equal((await call(route('play'), { index: 8, revision: previous }, A)).status, 409);
}
assert.equal(r.data.state.winner, 'rose');
assert.equal(r.data.score.rose, 1);
assert.equal((await call(route('play'), { index: 8, revision: r.data.revision }, B)).status, 400);
await call(route('rematch'), {});
r = await call(route('rematch'), { accept: true }, B);
assert.equal(r.status, 200);
assert.equal(r.data.state.game, 'tictactoe');
assert.ok(r.data.state.board.every(cell => cell === null));
assert.equal(r.data.state.winner, null);
console.log('Tic Tac Toe online: synchronized seats, impersonation rejection, stale moves, win scoring and rematch passed.');

/* ------------------------------------------------- two racing ladybugs ----- */

// Racing is the one game both players play at once, so the room has to accept
// two streams of crawls without either one scrambling the other's lane.
r = await call('/api/rooms', { name: 'Race night', playerName: 'Dylan', game: 'race', side: 'rose' });
id = r.data.id;
r = await call(route('join'), { playerName: 'Audrey' }, B);
assert.equal(r.data.state.game, 'race');
assert.equal(r.data.state.phase, 'ready');
assert.ok(Number.isFinite(r.data.now), 'the room tells a racing browser what time it is');

/** Move a bug up the track, so a test does not have to crawl a real 20 seconds. */
function placeBugs(lanes) {
  const row = sqlite.prepare('SELECT state FROM rooms WHERE id=?').get(id);
  const value = JSON.parse(row.state);
  Object.assign(value.lane, lanes);
  sqlite.prepare('UPDATE rooms SET state=? WHERE id=?').run(JSON.stringify(value), id);
}

// Either seat may choose the garden; both are put back to unready by it.
r = await call(route('play'), { action: 'track', track: 'moon', revision: r.data.revision }, B);
assert.equal(r.data.state.track, 'moon');
assert.equal((await call(route('play'), { action: 'track', track: 'lava', revision: r.data.revision })).status, 400);

// Nothing moves until both seats say so, and crawls before the gun do nothing.
r = await call(route('play'), { action: 'ready', revision: r.data.revision });
assert.equal(r.data.state.phase, 'ready', 'one ready is not a race');
assert.equal(r.data.state.ready.rose, true);
// A stale revision is fine here: both may press Ready in the same instant.
r = await call(route('play'), { action: 'ready', revision: 0 }, B);
assert.equal(r.data.state.phase, 'running');
const gun = r.data.state.startAt;
assert.ok(gun > Date.now(), 'ready, set, then crawl');

r = await call(route('play'), { action: 'crawl', taps: [[5000, 1]], revision: r.data.revision });
assert.equal(r.data.state.lane.rose, 0, 'a crawl from before the countdown is ignored');

// Both bugs crawl at once, neither one waiting for the other's revision.
const wait = ms => new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
await wait(gun + 40 - Date.now());
// Rose lands one crawl on every beat; cream lands one and squeezes an extra
// off-beat one in beside it. Long enough for rose's streak — and so the
// firefly's tempo — to climb.
for (let round = 0; round < 14; round++) {
  r = await call(route('play'), { action: 'crawl', taps: [[0, 1]], revision: r.data.revision });
  assert.equal(r.status, 200);
  // Cream never refreshes its revision, and never has to: crawls are its own
  // lane's business.
  r = await call(route('play'), { action: 'crawl', taps: [[0, 1], [90, 0]], revision: 0 }, B);
  assert.equal(r.status, 200, 'a racing crawl does not need a fresh revision');
  await wait(180);
}
assert.ok(r.data.state.lane.rose > 0 && r.data.state.lane.cream > 0, 'both bugs moved');
assert.equal(r.data.state.streak.rose, RACE.streakCap, 'an unbroken run fills the streak');
assert.ok(r.data.state.streak.cream <= 1, 'the extra off-beat crawl keeps costing cream its streak');
assert.ok(
  r.data.state.lane.rose > r.data.state.lane.cream * 1.15,
  `keeping time (${r.data.state.lane.rose.toFixed(0)}) beats tapping more often off the beat (${r.data.state.lane.cream.toFixed(0)})`,
);

// Now put rose on the ribbon so the finish can be tested in a heartbeat rather
// than a real twenty seconds.
placeBugs({ rose: RACE.length - 1 });
r = await call(route('sync'), {});
r = await call(route('play'), { action: 'crawl', taps: [[0, 1]], revision: r.data.revision });
assert.equal(r.data.state.heatResult, 'rose');
assert.equal(r.data.state.lane.rose, RACE.length);
assert.deepEqual(r.data.state.points, { rose: 1, cream: 0 });
assert.equal(r.data.score.rose, 0, 'a heat is not a match');

// A crawl already in flight when rose crossed still counts — a photo finish
// must not be lost to the network — but once that window closes, so does the
// heat.
assert.equal((await call(route('play'), { action: 'crawl', taps: [[0, 1]], revision: 0 }, B)).status, 200);
await wait(RACE.tieMs * 2 + 40);
assert.equal((await call(route('play'), { action: 'crawl', taps: [[0, 1]], revision: 0 }, B)).status, 400);

r = await call(route('sync'), {});
const peer = await call(route('sync'), {}, B);
assert.deepEqual(peer.data.state.lane, r.data.state.lane, 'both screens agree on the finish');

// Restarting a heat is refused while your person is plainly still there.
assert.equal((await call(route('play'), { action: 'abandon', revision: r.data.revision })).status, 409);

// Heat two: hand it to rose to take the match, and check the running score.
r = await call(route('play'), { action: 'ready', revision: r.data.revision });
r = await call(route('play'), { action: 'ready', revision: r.data.revision }, B);
assert.equal(r.data.state.heat, 2);
assert.equal(r.data.state.lane.rose, 0, 'the second heat starts at the gate');
await wait(r.data.state.startAt + 40 - Date.now());
assert.equal((await call(route('play'), { action: 'lapse', revision: r.data.revision })).status, 400,
  'a heat cannot be called early');
placeBugs({ rose: RACE.length - 1 });
r = await call(route('sync'), {});
r = await call(route('play'), { action: 'crawl', taps: [[0, 1]], revision: r.data.revision });
assert.equal(r.data.state.winner, 'rose');
assert.equal(r.data.score.rose, 1, 'the match counts towards the running score');
assert.equal((await call(route('play'), { action: 'ready', revision: r.data.revision })).status, 400, 'use a rematch');

await call(route('rematch'), {});
r = await call(route('rematch'), { accept: true }, B);
assert.equal(r.data.state.game, 'race');
assert.equal(r.data.state.heat, 1);
assert.deepEqual(r.data.state.points, { rose: 0, cream: 0 });
assert.equal(r.data.state.track, 'moon', 'a rematch keeps the garden you agreed on');
console.log('Ladybug Race online: server-held time, the ready gate, agreed tracks, simultaneous revision-free crawls, own-lane-only movement, a decided heat, match scoring and a rematch passed.');

sqlite.close();
console.log('Two-player server checks passed: lobby, passwords, seat ownership, illegal turns, stale moves, chat, rematches, offline pause and room closure.');
