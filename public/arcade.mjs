// The games that are not checkers, plus the redaction rules that keep secrets
// secret.
//
// Like engine.mjs these are pure functions shared with the Worker: each one
// returns a new state or null/throws when the move is not allowed, so the
// server can validate exactly what the browser just tried to do.

import { initial } from './engine.mjs';

export const gameNames = {
  checkers: 'Checkers',
  connect4: 'Connect Four',
  tictactoe: 'Tic Tac Toe',
  draw: 'Draw & Guess',
  puzzle: 'Photo Puzzle',
  memory: 'Memory Match',
  rps: 'Rock Paper Scissors',
  race: 'Ladybug Race',
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

/**
 * Ladybug Race. Every number the race depends on lives here so the browser
 * draws exactly the contest the Worker scores.
 *
 * The rhythm is a firefly sweeping back and forth across a bar, through a sweet
 * spot it crosses twice a sweep. A crawl that lands in the sweet spot is worth
 * far more than a hurried one — and it also makes the firefly *faster*. At a
 * standing start a sweep takes `slowBeatMs`, which is easy to read; at a full
 * streak it takes `fastBeatMs`, nearly twice as quick. So the reward for good
 * timing is more ground and a harder rhythm at the same time, and one off-beat
 * tap halves the streak, slowing the firefly back down.
 *
 * Crawling faster than `minTapMs` earns nothing at all, which is what keeps a
 * thumb and a keyboard on equal terms: timing, not tapping speed, is the game.
 */
export const RACE = {
  length: 1150, // track units from the start gate to the ribbon
  step: 1.8, // one ordinary crawl
  boost: 5.2, // added on top when a crawl lands on the beat
  streakGain: 0.13, // each consecutive boost is worth this much more
  streakCap: 10,
  minTapMs: 95, // crawls closer together than this do nothing
  slowBeatMs: 640, // one there-and-back sweep, from a standing start
  fastBeatMs: 400, // …and once the streak is full
  slowBandHalf: 0.3, // a generous sweet spot while you are finding the beat
  fastBandHalf: 0.15, // …and a tight one once you have it
  boostSlack: 0.88, // share of the honest gap the server will believe
  countdownMs: 3200, // "Ready… set… crawl!"
  limitMs: 75000, // a heat cannot run forever
  tieMs: 70, // crossings this close are a photo finish
  graceMs: 350, // allow for clock drift at the start gate
  maxTaps: 16, // per batch
  target: 2, // heats needed to win the match
  maxHeats: 5, // draws extend a match, but not forever
};

export const raceTracks = {
  tulip: 'Tulip Trail',
  creek: 'Creekside Crawl',
  moon: 'Moonlit Garden',
};

const RACE_BUGS = { rose: 'the cherry ladybug', cream: 'the vanilla ladybug' };
const RACE_SIDES = ['rose', 'cream'];

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
  if (game === 'tictactoe') state.board = Array(9).fill(null);

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

  if (game === 'race') {
    const choice = raceChoice(options.config?.track ?? options.track);
    Object.assign(state, {
      config: { track: choice },
      track: resolveTrack(choice),
      phase: 'ready', // ready → running (counting down, then crawling) → finished
      heat: 1,
      results: [], // one entry per finished heat
      points: { rose: 0, cream: 0 },
      ready: { rose: false, cream: false },
      lane: { rose: 0, cream: 0 },
      streak: { rose: 0, cream: 0 },
      lastTap: { rose: 0, cream: 0 },
      lastBoost: { rose: 0, cream: 0 },
      finished: { rose: null, cream: null },
      startAt: 0,
      heatResult: null,
    });
  }

  return state;
}

/* ------------------------------------------------------------- tic tac toe */

export const TIC_TAC_TOE_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6],
];

export function placeMark(state, index, side) {
  if (state.game !== 'tictactoe' || state.winner || !['rose', 'cream'].includes(side)
    || state.turn !== side || !Number.isInteger(index) || index < 0 || index > 8
    || state.board[index] !== null) return null;
  const next = structuredClone(state);
  next.board[index] = side;
  next.last = index;
  next.ply++;
  next.history.push(`${side === 'rose' ? 'Heart' : 'Tulip'} · row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}`);
  const line = TIC_TAC_TOE_LINES.find(cells => cells.every(cell => next.board[cell] === side));
  if (line) {
    next.winner = side;
    next.winning = [...line];
  } else if (next.board.every(Boolean)) next.winner = 'draw';
  next.turn = other(side);
  return next;
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

/* ------------------------------------------------------------ ladybug race */

const trackIds = () => Object.keys(raceTracks);

/** Whatever the client asked for, narrowed to a track the arcade can draw. */
function raceChoice(value) {
  return value === 'random' || Object.hasOwn(raceTracks, value) ? value : 'tulip';
}

/** "Surprise us" picks a fresh garden for every heat. Lanes are identical. */
function resolveTrack(choice) {
  if (choice !== 'random') return choice;
  const ids = trackIds();
  return ids[Math.floor(Math.random() * ids.length)];
}

/** 0 at a standing start, 1 once the streak is full. */
const flow = streak => Math.min(Math.max(streak, 0), RACE.streakCap) / RACE.streakCap;

/** How long one there-and-back sweep takes at this streak. */
export function raceTempo(streak = 0) {
  return RACE.slowBeatMs + (RACE.fastBeatMs - RACE.slowBeatMs) * flow(streak);
}

/** How wide the sweet spot is at this streak. Generous first, tight later. */
export function raceBand(streak = 0) {
  return RACE.slowBandHalf + (RACE.fastBandHalf - RACE.slowBandHalf) * flow(streak);
}

/**
 * The closest together two well-timed crawls can honestly be at this streak:
 * the end of one pass through the sweet spot to the start of the next. It is
 * the whole of the server's anti-cheat on boosts, so it follows the firefly
 * rather than being pinned to the slowest tempo.
 */
export function raceBoostGap(streak = 0) {
  return ((raceTempo(streak) * (1 - 2 * raceBand(streak))) / 2) * RACE.boostSlack;
}

/**
 * The rhythm, as both a picture and a judgement. `cycle` counts sweeps — a
 * running total the browser adds to each frame, so the firefly speeds up
 * smoothly instead of jumping when the streak changes. The sweet spot sits in
 * the middle of the sweep, so it comes around twice per cycle; `pass` numbers
 * those crossings, which is how the browser holds itself to one boost per pass.
 */
export function raceBeat(cycle, streak = 0) {
  const sweep = ((cycle % 1) + 1) % 1;
  const marker = sweep < 0.5 ? sweep * 2 : 2 - sweep * 2;
  const band = raceBand(streak);
  return {
    marker,
    band,
    onBeat: Math.abs(marker - 0.5) <= band,
    pass: Math.floor(cycle * 2),
    rising: sweep < 0.5, // which way the firefly is flying
  };
}

const tally = results => ({
  rose: results.filter(result => result === 'rose').length,
  cream: results.filter(result => result === 'cream').length,
});

/** The match is won at two heats, or decided on points once heats run out. */
function matchWinner(state) {
  const { rose, cream } = state.points;
  if (rose >= RACE.target) return 'rose';
  if (cream >= RACE.target) return 'cream';
  if (state.heat >= RACE.maxHeats) return rose === cream ? 'draw' : rose > cream ? 'rose' : 'cream';
  return null;
}

/**
 * Close the current heat. Re-callable with a different result, because a
 * crossing that arrives inside the photo-finish window turns a win into a tie.
 */
function settleHeat(next, result) {
  const first = next.heatResult === null;
  next.heatResult = result;
  next.phase = 'finished';
  next.ready = { rose: false, cream: false };
  next.results = [...next.results.slice(0, next.heat - 1), result];
  next.points = tally(next.results);
  next.winner = matchWinner(next);
  const line = result === 'draw'
    ? `Heat ${next.heat} · a photo finish`
    : `Heat ${next.heat} · ${RACE_BUGS[result]} takes it`;
  if (first) next.history.push(line);
  else next.history[next.history.length - 1] = line; // the same heat, retold
  return next;
}

/** Line both bugs up at the start gate and begin the "ready, set, crawl". */
function startHeat(next, now) {
  next.track = resolveTrack(next.config.track);
  next.phase = 'running';
  next.startAt = now + RACE.countdownMs;
  next.heatResult = null;
  next.ready = { rose: false, cream: false };
  for (const side of RACE_SIDES) {
    next.lane[side] = 0;
    next.streak[side] = 0;
    next.lastTap[side] = 0;
    next.lastBoost[side] = 0;
    next.finished[side] = null;
  }
  return next;
}

/** One crawl the server is willing to believe in, or null. */
function readTap(entry) {
  const [age, boost] = Array.isArray(entry) ? entry : [entry, 0];
  if (!Number.isFinite(age) || age < 0 || age > 6000) return null;
  return { age, boost: boost === 1 || boost === true };
}

/**
 * Every Ladybug Race action. The server owns the distance, the finish order and
 * the score; a player may only ever move their own bug, and only as fast as a
 * real thumb could.
 */
export function raceAction(state, body, side, now = Date.now()) {
  if (state.game !== 'race' || !RACE_SIDES.includes(side)) return null;
  const action = body.action;
  const next = structuredClone(state);

  // Pick the garden. Both players start over from unready so nobody is
  // surprised by a track they never saw.
  if (action === 'track') {
    if (state.phase !== 'ready' || state.winner) return null;
    const choice = raceChoice(body.track);
    if (choice !== 'random' && !Object.hasOwn(raceTracks, body.track)) return null;
    next.config = { track: choice };
    next.track = resolveTrack(choice);
    next.ready = { rose: false, cream: false };
    return next;
  }

  // Nobody crawls until both bugs are on the line.
  if (action === 'ready') {
    if (state.winner || state.phase === 'running') return null;
    next.ready[side] = body.ready !== false;
    if (!next.ready.rose || !next.ready.cream) return next;
    if (state.phase === 'finished') next.heat++;
    return startHeat(next, now);
  }

  // The heat ran out of time: the bug that got furthest takes it.
  if (action === 'lapse') {
    if (state.phase !== 'running' || now < state.startAt + RACE.limitMs) return null;
    const { rose, cream } = state.lane;
    return settleHeat(next, rose === cream ? 'draw' : rose > cream ? 'rose' : 'cream');
  }

  // A partner dropped out mid-heat: put the bugs back on the line and keep the
  // score. Whether that is allowed is the room's call, not the rules'.
  if (action === 'abandon') {
    if (state.phase !== 'running' || state.winner) return null;
    startHeat(next, now);
    next.phase = 'ready';
    next.startAt = 0;
    return next;
  }

  if (action !== 'crawl') return null;

  // A crawl is legal while the heat is running, and for a heartbeat after the
  // first bug crosses so a genuine photo finish is not lost to the network.
  const settling = state.phase === 'finished'
    && state.finished[other(side)] !== null
    && now - state.finished[other(side)] <= RACE.tieMs;
  if (state.phase !== 'running' && !settling) return null;
  if (state.finished[side] !== null) return null;
  if (state.winner && !settling) return null;

  const taps = Array.isArray(body.taps) ? body.taps.slice(0, RACE.maxTaps) : null;
  if (!taps || !taps.length) return null;
  const crawls = taps.map(readTap);
  if (crawls.some(tap => tap === null)) return null;
  // Oldest first, whatever order they arrived in.
  crawls.sort((a, b) => b.age - a.age);

  let crossedAt = null;
  for (const tap of crawls) {
    const at = now - tap.age;
    if (at < state.startAt - RACE.graceMs || at > now + 60) continue;
    if (at - next.lastTap[side] < RACE.minTapMs - 30) continue;

    // The browser decides whether a crawl landed on the beat; the server
    // decides how often that is physically possible — and since the firefly
    // flies faster the longer the streak runs, so does that limit. The streak
    // here is the one the player was racing against when they tapped, because
    // taps are replayed in the order they were made.
    const boost = tap.boost && at - next.lastBoost[side] >= raceBoostGap(next.streak[side]);
    if (boost) {
      next.streak[side] = Math.min(next.streak[side] + 1, RACE.streakCap);
      next.lane[side] += RACE.step + RACE.boost * (1 + next.streak[side] * RACE.streakGain);
      next.lastBoost[side] = at;
    } else {
      // One slip costs half the streak rather than all of it: forgiving for a
      // good player, still ruinous for anyone mashing through the beat.
      next.streak[side] = Math.floor(next.streak[side] / 2);
      next.lane[side] += RACE.step;
    }
    next.lastTap[side] = at;

    if (next.lane[side] >= RACE.length && crossedAt === null) crossedAt = at;
  }

  if (crossedAt === null) return next;

  next.lane[side] = RACE.length;
  next.finished[side] = crossedAt;
  const rival = next.finished[other(side)];
  const photoFinish = rival !== null && Math.abs(crossedAt - rival) <= RACE.tieMs;
  return settleHeat(next, photoFinish ? 'draw' : rival !== null && rival < crossedAt ? other(side) : side);
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
