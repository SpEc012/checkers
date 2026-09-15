// Ladybug Race: the rhythm, the rate limits, the finish line and the match.
//
// Everything the server is responsible for is in here, because the browser is
// allowed to say "that crawl was on the beat" but nothing else: how far a bug
// gets, who crossed first, and who wins the match are all decided by these
// functions running on the Worker.

import assert from 'node:assert/strict';
import {
  newGame, raceAction, raceBeat, raceBand, raceBoostGap, raceTempo, raceTracks, RACE,
} from '../public/arcade.mjs';

const T0 = 1_000_000;
const tap = (boost = 0, age = 0) => [age, boost];

/** Both bugs on the line, gun fired. Returns the state and the start time. */
function lineUp(options) {
  let state = raceAction(newGame('race', options), { action: 'ready' }, 'rose', T0);
  assert.equal(state.phase, 'ready', 'one bug on the line is not a race');
  state = raceAction(state, { action: 'ready' }, 'cream', T0);
  assert.equal(state.phase, 'running');
  assert.equal(state.startAt, T0 + RACE.countdownMs, 'ready, set, then crawl');
  assert.deepEqual(state.ready, { rose: false, cream: false }, 'readiness is spent, not kept');
  return state;
}

/** Crawl `count` times, on or off the beat, one every `gap` ms. */
function crawl(state, side, { count = 1, gap = RACE.slowBeatMs / 2, boost = true, from = null }) {
  let at = from ?? state.startAt;
  let current = state;
  for (let i = 0; i < count; i++) {
    at += gap;
    const next = raceAction(current, { action: 'crawl', taps: [tap(boost ? 1 : 0)] }, side, at);
    if (!next) return { state: current, at, refused: true };
    current = next;
  }
  return { state: current, at, refused: false };
}

/* ------------------------------------------------------------ a new garden */

assert.deepEqual(Object.keys(raceTracks), ['tulip', 'creek', 'moon']);
assert.equal(newGame('race').config.track, 'tulip');
assert.equal(newGame('race', { config: { track: 'lava' } }).config.track, 'tulip', 'nonsense falls back');
assert.equal(newGame('race', { config: { track: 'moon' } }).track, 'moon');
for (let i = 0; i < 40; i++) {
  const surprise = newGame('race', { config: { track: 'random' } });
  assert.equal(surprise.config.track, 'random', 'the choice is remembered as random');
  assert.ok(Object.hasOwn(raceTracks, surprise.track), 'but a real garden is always drawn');
}

const picked = raceAction(newGame('race'), { action: 'track', track: 'creek' }, 'cream', T0);
assert.equal(picked.track, 'creek');
assert.equal(raceAction(picked, { action: 'track', track: 'swamp' }, 'rose', T0), null);
assert.equal(
  raceAction(raceAction(picked, { action: 'ready' }, 'rose', T0), { action: 'track', track: 'moon' }, 'cream', T0).ready.rose,
  false,
  'changing the garden puts everyone back to unready',
);
assert.equal(raceAction(lineUp(), { action: 'track', track: 'moon' }, 'rose', T0), null, 'not mid-heat');

/* --------------------------------------------------- crawling, and cheating */

{
  const race = lineUp();
  assert.equal(
    raceAction(race, { action: 'crawl', taps: [tap(1, 4000)] }, 'rose', race.startAt).lane.rose,
    0,
    'a crawl from before the gun does not count',
  );
  assert.equal(raceAction(race, { action: 'crawl', taps: [] }, 'rose', race.startAt + 500), null);
  assert.equal(raceAction(race, { action: 'crawl', taps: 'lots' }, 'rose', race.startAt + 500), null);
  assert.equal(raceAction(race, { action: 'crawl', taps: [[NaN, 1]] }, 'rose', race.startAt + 500), null);
  assert.equal(raceAction(race, { action: 'nap' }, 'rose', race.startAt + 500), null);

  // A player may only ever move their own bug.
  const mine = raceAction(race, { action: 'crawl', taps: [tap(1)] }, 'rose', race.startAt + 300);
  assert.ok(mine.lane.rose > 0);
  assert.equal(mine.lane.cream, 0, 'crawling never touches the other lane');

  // Faster than a thumb can go: sixteen crawls 10 ms apart are mostly thrown
  // away, and the handful that land are worth less than three that were timed.
  const hammered = raceAction(race, {
    action: 'crawl',
    taps: Array.from({ length: RACE.maxTaps }, (_, i) => tap(1, i * 10)),
  }, 'cream', race.startAt + 400);
  const timed = crawl(race, 'cream', { count: 3, boost: true }).state;
  assert.ok(
    hammered.lane.cream < timed.lane.cream,
    `sixteen crowded crawls (${hammered.lane.cream.toFixed(1)}) beaten by three timed ones (${timed.lane.cream.toFixed(1)})`,
  );
  assert.ok(hammered.streak.cream <= 1, 'and no streak survives the crowding');

  // A boost claimed too soon after the last one is scored as an ordinary crawl.
  assert.ok(RACE.minTapMs + 5 < raceBoostGap(0), 'the gap under test really is too short');
  const quick = crawl(race, 'rose', { count: 2, gap: RACE.minTapMs + 5, boost: true }).state;
  assert.equal(quick.streak.rose, 0, 'a second boost inside the same pass is just a crawl');
  assert.equal(
    Math.round(quick.lane.rose * 1000),
    Math.round((RACE.step * 2 + RACE.boost * (1 + RACE.streakGain)) * 1000),
  );
}

/* ------------------------------------------------- the streak, and the beat */

{
  // A run of good timing builds; one slip costs half of it, not all of it.
  const built = crawl(lineUp(), 'rose', { count: 6, boost: true }).state;
  assert.equal(built.streak.rose, 6);
  const slipped = crawl(built, 'rose', { count: 1, boost: false, from: built.lastTap.rose }).state;
  assert.equal(slipped.streak.rose, 3, 'a miss halves the streak');
  const recovered = crawl(slipped, 'rose', { count: 1, boost: true, from: slipped.lastTap.rose }).state;
  assert.equal(recovered.streak.rose, 4, 'and it builds straight back');

  let capped = lineUp();
  capped = crawl(capped, 'rose', { count: RACE.streakCap + 5, boost: true }).state;
  assert.equal(capped.streak.rose, RACE.streakCap, 'the streak stops climbing eventually');
}

{
  // The rhythm the browser draws: a firefly sweeping there and back through a
  // sweet spot it crosses twice a sweep. `cycle` counts sweeps, not time, so
  // the tempo can change without the firefly ever jumping.
  assert.equal(raceBeat(0).marker, 0);
  assert.ok(Math.abs(raceBeat(0.5).marker - 1) < 1e-9, 'halfway is the far end');
  assert.ok(raceBeat(0.25).onBeat, 'the middle of the sweep is the sweet spot');
  assert.ok(!raceBeat(0).onBeat && !raceBeat(0.5).onBeat, 'the ends are not');
  assert.equal(raceBeat(2).pass, 4, 'two passes to a sweep');
  assert.equal(raceBeat(0.25).rising, true, 'the firefly flies out…');
  assert.equal(raceBeat(0.75).rising, false, '…and back again');
  assert.deepEqual(raceBeat(3.25).marker, raceBeat(0.25).marker, 'every sweep is the same shape');

  for (const streak of [0, RACE.streakCap]) {
    let inside = 0;
    const steps = 2000;
    for (let i = 0; i < steps; i++) if (raceBeat(i / steps, streak).onBeat) inside++;
    const share = inside / steps;
    assert.ok(Math.abs(share - raceBand(streak) * 2) < 0.01, `the glow is ${raceBand(streak) * 200}% of the sweep`);
  }
}

/* ------------------------------------------- the firefly speeds up with you */

{
  // A standing start is slow and forgiving; a full streak is fast and tight.
  assert.equal(raceTempo(0), RACE.slowBeatMs);
  assert.equal(raceTempo(RACE.streakCap), RACE.fastBeatMs);
  assert.equal(raceTempo(RACE.streakCap * 5), RACE.fastBeatMs, 'and no faster than that');
  assert.ok(raceTempo(5) > raceTempo(6), 'every well-timed crawl speeds it up');
  assert.ok(RACE.fastBeatMs < RACE.slowBeatMs * 0.7, 'the difference is worth noticing');

  assert.equal(raceBand(0), RACE.slowBandHalf);
  assert.equal(raceBand(RACE.streakCap), RACE.fastBandHalf);
  assert.ok(raceBand(5) > raceBand(6), 'and narrows the glow as it goes');

  // The server's boost spacing has to follow the firefly, or well-timed crawls
  // at full speed would be thrown away as impossible.
  for (const streak of [0, 3, 7, RACE.streakCap]) {
    const honest = (raceTempo(streak) * (1 - 2 * raceBand(streak))) / 2;
    assert.ok(raceBoostGap(streak) < honest, `a real crawl at streak ${streak} is never refused`);
    assert.ok(raceBoostGap(streak) > honest * 0.6, `but a fake one at streak ${streak} still is`);
  }
  // The glow narrows about as fast as the firefly speeds up, so the honest
  // spacing between two boosts barely moves across the whole ramp — and it
  // stays above the tap limit, so crawling on every beat at full speed is never
  // mistaken for mashing.
  const gaps = [0, 2, 4, 6, 8, RACE.streakCap].map(raceBoostGap);
  assert.ok(Math.max(...gaps) < Math.min(...gaps) * 1.3, 'the boost limit holds steady as the tempo climbs');
  assert.ok(RACE.minTapMs < Math.min(...gaps), 'and always leaves room for a real crawl');
}

/* ---------------------------------------------------- rhythm beats mashing */

{
  // The promise the game makes: over the same stretch of time, keeping time
  // gets you further than tapping as fast as you can. This is what makes a
  // phone and a keyboard equally competitive.
  // A stand-in for the browser: carry a cycle forward at whatever tempo this
  // player's own streak has earned, and claim a boost exactly when the firefly
  // really is in the glow. The only difference between the two players below
  // is when they choose to tap.
  const run = watching => {
    let state = lineUp();
    let now = state.startAt;
    let cycle = 0;
    let lastTap = -1e9;
    let lastPass = -1;
    let streak = 0;
    const tick = 2;

    while (now - state.startAt < 12000) {
      cycle += tick / raceTempo(streak);
      now += tick;
      const beat = raceBeat(cycle, streak);
      // The rhythm player waits for the middle of the glow; the masher does not.
      const wants = watching ? Math.abs(beat.marker - 0.5) < 0.02 : true;
      if (!wants || now - lastTap < RACE.minTapMs) continue;
      lastTap = now;

      const boost = beat.onBeat && beat.pass !== lastPass;
      if (boost) lastPass = beat.pass;
      streak = boost ? Math.min(streak + 1, RACE.streakCap) : Math.floor(streak / 2);
      const next = raceAction(state, { action: 'crawl', taps: [tap(boost ? 1 : 0)] }, 'rose', now);
      if (next) state = next;
    }
    return { gone: Math.round(state.lane.rose), streak };
  };

  const rhythm = run(true);
  const mashing = run(false);
  assert.equal(rhythm.streak, RACE.streakCap, 'keeping time fills the streak');
  assert.ok(mashing.streak < 3, 'mashing never holds one');
  assert.ok(
    rhythm.gone > mashing.gone * 1.25,
    `rhythm (${rhythm.gone}) must clearly beat mashing (${mashing.gone})`,
  );
  assert.ok(
    mashing.gone > rhythm.gone * 0.45,
    `but mashing (${mashing.gone}) is never hopeless against rhythm (${rhythm.gone})`,
  );
}

/* ------------------------------------------- the ribbon, and a photo finish */

{
  let race = lineUp();
  race.lane.rose = RACE.length - 1;
  const won = raceAction(race, { action: 'crawl', taps: [tap(1)] }, 'rose', race.startAt + 500);
  assert.equal(won.lane.rose, RACE.length, 'a bug stops at the ribbon');
  assert.equal(won.heatResult, 'rose');
  assert.equal(won.phase, 'finished');
  assert.deepEqual(won.points, { rose: 1, cream: 0 });
  assert.equal(won.history.at(-1), 'Heat 1 · the cherry ladybug takes it');

  assert.equal(raceAction(won, { action: 'crawl', taps: [tap(1)] }, 'rose', won.finished.rose + 10), null,
    'nobody finishes twice');

  // A crossing that lands inside the photo-finish window makes it a tie, and
  // the point that was already handed out is taken back.
  const staged = structuredClone(won);
  staged.lane.cream = RACE.length - 1;
  const tied = raceAction(staged, { action: 'crawl', taps: [tap(1)] }, 'cream', won.finished.rose + RACE.tieMs - 10);
  assert.equal(tied.heatResult, 'draw');
  assert.deepEqual(tied.points, { rose: 0, cream: 0 }, 'a tie is nobody’s heat');
  assert.equal(tied.history.length, 1, 'and it is the same heat, retold');
  assert.equal(tied.history.at(-1), 'Heat 1 · a photo finish');

  assert.equal(raceAction(staged, { action: 'crawl', taps: [tap(1)] }, 'cream', won.finished.rose + RACE.tieMs + 400),
    null, 'arriving late is arriving late');
}

/* ------------------------------------------------------- running out of time */

{
  const race = lineUp();
  assert.equal(raceAction(race, { action: 'lapse' }, 'rose', race.startAt + 1000), null, 'there is still time');
  const behind = structuredClone(race);
  behind.lane.cream = 380;
  behind.lane.rose = 120;
  const called = raceAction(behind, { action: 'lapse' }, 'rose', race.startAt + RACE.limitMs);
  assert.equal(called.heatResult, 'cream', 'furthest along takes it');
  assert.deepEqual(called.points, { rose: 0, cream: 1 });

  const level = raceAction(race, { action: 'lapse' }, 'cream', race.startAt + RACE.limitMs);
  assert.equal(level.heatResult, 'draw', 'neither of them moved');
}

/* ------------------------------------------- a partner who walks away mid-heat */

{
  const race = crawl(lineUp(), 'rose', { count: 4 }).state;
  const back = raceAction(race, { action: 'abandon' }, 'cream', T0 + 9000);
  assert.equal(back.phase, 'ready');
  assert.deepEqual(back.lane, { rose: 0, cream: 0 }, 'the heat starts over');
  assert.equal(back.heat, 1, 'and it is still the same heat');
  assert.deepEqual(back.points, { rose: 0, cream: 0 });
  assert.equal(raceAction(back, { action: 'abandon' }, 'rose', T0), null, 'nothing to abandon at the line');
}

/* --------------------------------------------------------- best of three */

/** Walk a whole match, handing each heat to `winner`. */
function playMatch(results) {
  let state = newGame('race');
  let clock = T0;
  for (const winner of results) {
    state = raceAction(state, { action: 'ready' }, 'rose', clock);
    state = raceAction(state, { action: 'ready' }, 'cream', clock);
    clock = state.startAt + 20000;
    if (winner === 'draw') {
      state = raceAction(state, { action: 'lapse' }, 'rose', state.startAt + RACE.limitMs);
    } else {
      state.lane[winner] = RACE.length - 1;
      state = raceAction(state, { action: 'crawl', taps: [tap(1)] }, winner, clock);
    }
    clock += 5000;
  }
  return state;
}

{
  const swept = playMatch(['rose', 'rose']);
  assert.equal(swept.winner, 'rose');
  assert.deepEqual(swept.points, { rose: 2, cream: 0 });
  assert.equal(swept.heat, 2);
  assert.equal(raceAction(swept, { action: 'ready' }, 'rose', T0), null, 'the match is over; use a rematch');

  const decider = playMatch(['rose', 'cream', 'cream']);
  assert.equal(decider.winner, 'cream', 'one each, then a decider');
  assert.equal(decider.heat, 3);

  // Drawn heats give nobody a point, so they extend the match — but not past
  // the cap, where whoever is ahead on heats takes it.
  const dragging = playMatch(['draw', 'draw', 'draw', 'draw', 'rose']);
  assert.equal(dragging.heat, 5);
  assert.equal(dragging.winner, 'rose');
  assert.deepEqual(dragging.results, ['draw', 'draw', 'draw', 'draw', 'rose']);

  const stalemate = playMatch(['draw', 'draw', 'draw', 'draw', 'draw']);
  assert.equal(stalemate.winner, 'draw', 'five photo finishes really is a tie');

  // A rematch keeps the garden the two of you agreed on.
  const again = newGame('race', { config: playMatch(['rose', 'rose']).config });
  assert.equal(again.config.track, 'tulip');
  assert.equal(again.heat, 1);
  assert.deepEqual(again.results, []);
}

console.log('Ladybug Race checks passed: track choice, the ready gate, own-lane-only crawls, tap and boost rate limits, streaks, rhythm beating mashing, the ribbon, photo finishes, time limits, abandoned heats and best-of-three.');
