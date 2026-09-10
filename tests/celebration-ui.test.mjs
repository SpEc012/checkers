// The victory overlay, driven through a stand-in document.
//
// The important behaviour is that a result appears exactly once: polling the
// room every 1.5 seconds must not reopen a card the player has dismissed, and
// a Rock Paper Scissors result has to wait for the countdown to finish.

import assert from 'node:assert/strict';
import { createCelebration, celebrationKey, confettiFace, CONFETTI_PIECES } from '../public/celebration.mjs';

const makeElement = () => ({
  hidden: true,
  textContent: '',
  children: [],
  style: { setProperty() {} },
  replaceChildren() {
    this.children = [];
  },
  append(child) {
    this.children.push(child);
  },
});

const elements = new Map();
const query = selector => {
  if (!elements.has(selector)) elements.set(selector, makeElement());
  return elements.get(selector);
};

let shown = 0;
const names = { rose: 'Dylan', cream: 'Audrey' };
const celebration = createCelebration({
  query,
  reducedMotion: () => false,
  onShow: () => shown++,
  doc: { createElement: makeElement },
});

const snapshot = ({ game, outcome, ply = 0, round = 0, throwing = false, matchOver = false }) => ({
  key: celebrationKey({ generation: 1, game, outcome, ply, round }),
  outcome,
  game,
  names,
  throwing,
  matchOver,
});

// --- every game shows its result, once --------------------------------------
for (const game of ['checkers', 'connect4', 'memory', 'puzzle', 'draw', 'rps']) {
  const outcome = ['puzzle', 'draw'].includes(game) ? 'together' : 'cream';

  celebration.update(snapshot({ game, outcome: null }));
  assert.equal(query('#victory').hidden, true, `${game} shows nothing while the game is live`);

  assert.equal(celebration.update(snapshot({ game, outcome, ply: 10 })), true);
  assert.equal(query('#victory').hidden, false, `${game} must show the overlay`);
  assert.ok(query('#victoryName').textContent.includes('Audrey'));
  assert.equal(query('#victoryConfetti').children.length, CONFETTI_PIECES);

  celebration.close();
  assert.equal(celebration.update(snapshot({ game, outcome, ply: 10 })), false);
  assert.equal(query('#victory').hidden, true, 'polling must not reopen a dismissed result');
}
assert.equal(shown, 6, 'one fanfare per result');

// --- rock paper scissors waits for the countdown ----------------------------
celebration.update(snapshot({ game: 'rps', outcome: null }));
celebration.update(snapshot({ game: 'rps', outcome: 'cream', ply: 2, round: 1, throwing: true }));
assert.equal(query('#victory').hidden, true, 'no spoilers while the hands are still bouncing');

celebration.update(snapshot({ game: 'rps', outcome: 'cream', ply: 2, round: 1 }));
assert.equal(query('#victory').hidden, false);
assert.equal(query('#victoryResult').textContent, 'WINS THIS THROW!');

celebration.close();
celebration.update(snapshot({ game: 'rps', outcome: 'cream', ply: 9, round: 3, matchOver: true }));
assert.equal(query('#victoryResult').textContent, 'WINS THE MATCH!');

// --- keys and confetti ------------------------------------------------------
const key = { generation: 1, game: 'checkers', outcome: 'rose', ply: 4, round: 0 };
assert.equal(celebrationKey(key), celebrationKey({ ...key }), 'the same result keeps the same key');
assert.notEqual(celebrationKey(key), celebrationKey({ ...key, ply: 5 }));
assert.notEqual(celebrationKey(key), celebrationKey({ ...key, generation: 2 }), 'a new room celebrates again');
assert.equal(confettiFace(0), '🐞');
assert.ok(new Set(Array.from({ length: CONFETTI_PIECES }, (_, i) => confettiFace(i))).size === 3);

// --- reduced motion drops the confetti but keeps the words ------------------
const calm = createCelebration({ query, reducedMotion: () => true, doc: { createElement: makeElement } });
calm.update(snapshot({ game: 'checkers', outcome: 'rose', ply: 3 }));
assert.equal(query('#victory').hidden, false);
assert.equal(query('#victoryConfetti').children.length, 0);

console.log('Celebration checks passed for all six games, RPS rounds, countdown delay, confetti, reduced motion and polling deduplication.');
