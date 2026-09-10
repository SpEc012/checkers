// The five games that are not checkers, plus the redaction rules that keep
// secrets secret.
//
// Like engine.mjs these are pure functions shared with the Worker: each one
// returns a new state or null/throws when the move is not allowed, so the
// server can validate exactly what the browser just tried to do.

import { initial } from './engine.mjs';

export const gameNames = {
  checkers: 'Checkers',
  connect4: 'Connect Four',
  draw: 'Draw & Guess',
  puzzle: 'Photo Puzzle',
  memory: 'Memory Match',
  rps: 'Rock Paper Scissors',
};

const PROMPTS = [
  'tulip', 'sunset', 'pancakes', 'penguin', 'campfire', 'snowman', 'rainbow', 'popcorn',
  'butterfly', 'pizza', 'mountain', 'moon', 'umbrella', 'birthday cake', 'hot chocolate',
  'bicycle', 'guitar', 'cactus', 'lighthouse', 'teddy bear', 'airplane', 'waterfall',
  'strawberry', 'roller coaster', 'ice cream', 'love letter', 'dinosaur', 'sandcastle',
  'fireworks', 'picnic',
];

const MEMORY_FACES = ['🌷', '💗', '🍓', '🧸', '🌙', '🦋', '🍒', '🌻'];
const THROWS = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
const MISMATCH_REVEAL = 1400; // ms two unmatched cards stay face up
const MAX_STROKES = 160;
const MAX_STROKE_POINTS = 80;

const other = side => (side === 'rose' ? 'cream' : 'rose');

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Normalise whatever the client sent into a valid puzzle configuration. */
export function puzzleOptions(options = {}) {
  const config = options.config || options;
  return {
    size: [3, 4, 6, 8].includes(config.size) ? config.size : 4,
    cut: config.cut === 'triangles' ? 'triangles' : 'squares',
    rotate: config.rotate === true,
    peek: config.peek !== false,
  };
}

/** Start any game. Checkers keeps its own richer shape. */
export function newGame(game = 'checkers', options = {}) {
  if (!Object.hasOwn(gameNames, game)) throw new Error('Choose an available game.');
  if (game === 'checkers') return { ...initial(), game };

  const state = {
    game,
    board: [],
    turn: options.turn || 'rose',
    winner: null,
    ply: 0,
    history: [],
    forced: null,
  };

  if (game === 'connect4') state.board = Array(42).fill(null);

  if (game === 'draw') {
    Object.assign(state, {
      word: PROMPTS[Math.floor(Math.random() * PROMPTS.length)],
      strokes: [],
      round: options.round || 1,
      guesses: [],
      revealed: false,
    });
  }

  if (game === 'puzzle') {
    const config = puzzleOptions(options);
    const count = config.size ** 2 * (config.cut === 'triangles' ? 2 : 1);
    Object.assign(state, {
      board: Array(count).fill(null),
      tray: shuffle(Array.from({ length: count }, (_, i) => i)),
      photoKey: options.photoKey || null,
      config,
      rotations: Array.from({ length: count }, () => (config.rotate ? Math.floor(Math.random() * 4) : 0)),
    });
  }

  if (game === 'memory') {
    Object.assign(state, {
      deck: shuffle([...MEMORY_FACES, ...MEMORY_FACES]),
      matched: Array(16).fill(null),
      flipped: [],
      revealUntil: 0,
      points: { rose: 0, cream: 0 },
    });
  }

  if (game === 'rps') {
    Object.assign(state, {
      picks: { rose: null, cream: null },
      round: 1,
      roundResult: null,
      points: { rose: 0, cream: 0 },
    });
  }

  return state;
}

/* ------------------------------------------------------------ connect four */

export function dropHeart(state, column, side) {
  const legal = state.game === 'connect4' && !state.winner && state.turn === side
    && Number.isInteger(column) && column >= 0 && column <= 6;
  if (!legal) return null;

  let row = 5;
  while (row >= 0 && state.board[row * 7 + column]) row--;
  if (row < 0) return null;

  const next = structuredClone(state);
  next.board[row * 7 + column] = side;
  next.ply++;
  next.last = row * 7 + column;
  next.history.push(`Heart in column ${column + 1}`);

  for (const [rowStep, columnStep] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [next.last];
    for (const direction of [-1, 1]) {
      let r = row + rowStep * direction;
      let c = column + columnStep * direction;
      while (r >= 0 && r < 6 && c >= 0 && c < 7 && next.board[r * 7 + c] === side) {
        line.push(r * 7 + c);
        r += rowStep * direction;
        c += columnStep * direction;
      }
    }
    if (line.length >= 4) {
      next.winner = side;
      next.winning = line;
      break;
    }
  }

  if (!next.winner && next.board.every(Boolean)) next.winner = 'draw';
  next.turn = other(side);
  return next;
}

/* ------------------------------------------------------------ photo puzzle */

/** Drop a tile into its home square. Pieces only fit where they belong. */
export function placeTile(state, piece, target) {
  const legal = state.game === 'puzzle' && !state.winner
    && Number.isInteger(piece) && piece >= 0 && piece < state.board.length
    && piece === target && state.board[target] === null
    && (state.rotations?.[piece] || 0) === 0;
  if (!legal) return null;

  const next = structuredClone(state);
  next.board[target] = piece;
  next.ply++;
  next.history.push('Placed a little piece');
  if (next.board.every(value => value !== null)) next.winner = 'together';
  return next;
}

export function puzzleAction(state, body) {
  if (body.action !== 'rotate') return placeTile(state, body.piece, body.target);

  const legal = state.game === 'puzzle' && !state.winner && state.config?.rotate
    && Number.isInteger(body.piece) && body.piece >= 0 && body.piece < state.board.length
    && state.board[body.piece] === null;
  if (!legal) return null;

  const next = structuredClone(state);
  next.rotations[body.piece] = (next.rotations[body.piece] + 1) % 4;
  next.ply++;
  return next;
}

/* ------------------------------------------------------------ memory match */

export function memoryAction(state, index, side, now = Date.now()) {
  const legal = state.game === 'memory' && !state.winner && state.turn === side
    && Number.isInteger(index) && index >= 0 && index <= 15
    && !state.matched[index] && state.revealUntil <= now;
  if (!legal) return null;

  const next = structuredClone(state);
  if (next.flipped.length === 2) next.flipped = [];
  if (next.flipped.includes(index)) return null;
  next.flipped.push(index);
  next.ply++;

  if (next.flipped.length === 2) {
    const [first, second] = next.flipped;
    if (next.deck[first] === next.deck[second]) {
      next.matched[first] = side;
      next.matched[second] = side;
      next.points[side]++;
      next.flipped = [];
      if (next.matched.every(Boolean)) {
        next.winner = next.points.rose === next.points.cream ? 'draw'
          : next.points.rose > next.points.cream ? 'rose' : 'cream';
      }
    } else {
      // Leave the mismatch face up for a moment, then hand over the turn.
      next.revealUntil = now + MISMATCH_REVEAL;
      next.turn = other(side);
    }
  }
  return next;
}

/* --------------------------------------------------- rock paper scissors */

export function rpsAction(state, body, side) {
  if (state.game !== 'rps' || state.winner) return null;
  const next = structuredClone(state);

  if (body.action === 'next') {
    if (!state.roundResult) return null;
    next.picks = { rose: null, cream: null };
    next.roundResult = null;
    next.round++;
    next.ply++;
    return next;
  }

  if (state.roundResult || state.picks[side] || !THROWS.includes(body.choice)) return null;
  next.picks[side] = body.choice;
  next.ply++;

  if (next.picks.rose && next.picks.cream) {
    const { rose, cream } = next.picks;
    next.roundResult = rose === cream ? 'draw' : BEATS[rose] === cream ? 'rose' : 'cream';
    if (next.roundResult !== 'draw') next.points[next.roundResult]++;
    if (next.points.rose >= 3 || next.points.cream >= 3) next.winner = next.roundResult;
    next.history.push(`Round ${next.round}: ${next.roundResult === 'draw' ? 'tie' : `${next.roundResult} wins`}`);
  }
  return next;
}

/* ------------------------------------------------------------ draw & guess */

const normalise = text => text.toLowerCase().replace(/[^a-z0-9]/g, '');

export function drawingAction(state, action, body, side) {
  if (state.game !== 'draw') throw new Error('Open Draw & Guess first.');
  const next = structuredClone(state);

  if (action === 'next') {
    if (!state.revealed) throw new Error('Finish this round first.');
    return newGame('draw', { turn: other(state.turn), round: state.round + 1 });
  }
  if (state.revealed) throw new Error('This round is finished.');

  if (action === 'guess') {
    if (side === state.turn) throw new Error('The other player gets to guess.');
    const text = String(body.text || '').trim().slice(0, 60);
    if (!text) throw new Error('Type a guess.');
    next.guesses.push({ side, text });
    next.guesses = next.guesses.slice(-30);
    if (normalise(text) === normalise(state.word)) {
      next.revealed = true;
      next.winner = 'together';
    }
    next.ply++;
    return next;
  }

  if (side !== state.turn) throw new Error('Only the artist can draw.');

  if (action === 'reveal') {
    next.revealed = true;
    next.winner = 'draw';
    return next;
  }
  if (action === 'clear') {
    next.strokes = [];
    next.ply++;
    return next;
  }
  if (action === 'undo') {
    next.strokes.pop();
    next.ply++;
    return next;
  }
  if (action === 'stroke') {
    if (next.strokes.length >= MAX_STROKES) throw new Error('The sketch is full. Undo or clear to keep drawing.');
    const points = body.points;
    const validPoint = point => Array.isArray(point) && point.length === 2
      && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1);
    if (!Array.isArray(points) || points.length < 1 || points.length > MAX_STROKE_POINTS || !points.every(validPoint)) {
      throw new Error('Invalid drawing stroke.');
    }
    if (!/^#[a-f0-9]{6}$/i.test(body.color) || ![3, 7, 14].includes(body.width)) throw new Error('Invalid brush.');
    next.strokes.push({ points, color: body.color, width: body.width });
    next.ply++;
    return next;
  }

  throw new Error('Unknown drawing action.');
}

/* --------------------------------------------------------------- redaction */

/** The view of a game one player is allowed to see. */
export function publicGame(state, side, now = Date.now()) {
  const view = structuredClone(state);

  if (view.game === 'draw' && view.turn !== side && !view.revealed) {
    view.word = null;
    view.letters = state.word.replace(/[^ ]/g, '_');
  }

  if (view.game === 'memory') {
    const shown = view.flipped.length === 2 && view.revealUntil <= now ? [] : view.flipped;
    view.deck = state.deck.map((face, index) => (view.matched[index] || shown.includes(index) ? face : null));
    view.flipped = shown;
  }

  if (view.game === 'rps' && !view.roundResult) {
    const opponent = other(side);
    view.opponentPicked = !!view.picks[opponent];
    view.picks[opponent] = null;
  }

  return view;
}
