// Timing and words for the moments between moves: the Rock Paper Scissors
// countdown, and the line that lands on the victory card.
//
// Pure maths and strings, so both the 3D scene and the tests can use them.

/** How long the full "rock… paper… scissors… shoot!" sequence runs, in ms. */
export const THROW_DURATION = 2700;

const BEAT = 0.72; // seconds per bounce
const BEATS = 3;
const WORDS = ['Rock!', 'Paper!', 'Scissors!'];
const OPEN_SPAN = 0.3; // seconds for one finger to unfurl
const FINGER_STAGGER = 0.05; // seconds between fingers

const clamp01 = value => Math.min(1, Math.max(0, value));

/**
 * One frame of the countdown.
 * @param {number} elapsed seconds since the throw started
 * @param {boolean} reduced honour prefers-reduced-motion: skip straight to the reveal
 * @returns {object} animation channels:
 *   `bounce`/`tilt` drive the three beats, `wrist` is the roll that leads them,
 *   `blend` opens the hand into its final shape (0 → 1), `impact` is the recoil
 *   on the reveal, `snap` a short overshoot as the shape lands, `settle` the
 *   damped wobble afterwards, and `sinceShoot` seconds since "shoot".
 */
export function throwFrame(elapsed, reduced = false) {
  if (reduced) {
    return {
      bounce: 0, tilt: 0, wrist: 0, blend: 1, word: 'Shoot!',
      impact: 0, snap: 0, settle: 0, sinceShoot: 1, beat: BEATS,
    };
  }

  const shoot = BEAT * BEATS;
  const time = Math.max(0, elapsed);
  const shaking = time < shoot;
  const phase = (time % BEAT) / BEAT;
  const sinceShoot = Math.max(0, time - shoot);

  // A firm downward beat followed by a full lift, three times in sync.
  const lift = shaking ? Math.sin(phase * Math.PI) ** 2 : 0;

  return {
    bounce: lift * 0.9,
    tilt: lift * 0.24,
    // The wrist rolls a quarter-beat ahead of the bounce, so the hand leads
    // with the knuckles instead of moving as one rigid block.
    wrist: shaking ? Math.sin(phase * Math.PI * 2) * 0.26 : 0,
    blend: clamp01(sinceShoot / 0.32),
    word: shaking ? WORDS[Math.floor(time / BEAT)] : 'Shoot!',
    impact: shaking ? 0 : Math.max(0, 1 - sinceShoot / 0.28),
    snap: shaking ? 0 : Math.sin(clamp01(sinceShoot / 0.34) * Math.PI) * (1 - clamp01(sinceShoot / 0.55)),
    settle: shaking ? 0 : Math.exp(-sinceShoot * 5) * Math.sin(sinceShoot * 24),
    sinceShoot,
    beat: Math.min(BEATS, Math.floor(time / BEAT)),
  };
}

/**
 * How far one finger has unfurled, `index` 0 first. Fingers open in sequence
 * rather than together, which is what makes the reveal read as a hand.
 */
export function fingerOpen(sinceShoot, index) {
  const t = clamp01((sinceShoot - index * FINGER_STAGGER) / OPEN_SPAN);
  return 1 - (1 - t) ** 3; // ease out
}

/** The headline, result and note for a finished game. */
export function victoryCopy(winner, names, game) {
  if (winner === 'together') {
    return {
      headline: `${names.rose} + ${names.cream}`,
      result: 'Win together!',
      note: game === 'puzzle' ? 'Every little piece found its way home.' : 'Two minds. One very good team.',
      bang: 'TOGETHER!',
    };
  }
  if (winner === 'draw') {
    return {
      headline: 'A perfect little tie.',
      result: 'Too in sync.',
      note: 'Call it even. Steal a kiss.',
      bang: 'JINX!',
    };
  }
  return {
    headline: names[winner] || 'Your person',
    result: 'WINS!',
    note: 'Bragging rights earned. A kiss is still owed.',
    bang: 'BANG!',
  };
}
