// Timing and words for the moments between moves: the Rock Paper Scissors
// countdown, and the line that lands on the victory card.
//
// Pure maths and strings, so both the 3D scene and the tests can use them.

/** How long the full "rock… paper… scissors… shoot!" sequence runs, in ms. */
export const THROW_DURATION = 2700;

const BEAT = 0.72; // seconds per bounce
const BEATS = 3;
const WORDS = ['Rock!', 'Paper!', 'Scissors!'];

/**
 * One frame of the countdown.
 * @param {number} elapsed seconds since the throw started
 * @param {boolean} reduced honour prefers-reduced-motion: skip straight to the reveal
 * @returns {{bounce:number, tilt:number, blend:number, word:string, impact:number}}
 *   `bounce`/`tilt` animate the fist, `blend` opens the hand into its final
 *   shape (0 → 1) and `impact` is the little recoil on the reveal.
 */
export function throwFrame(elapsed, reduced = false) {
  if (reduced) return { bounce: 0, tilt: 0, blend: 1, word: 'Shoot!', impact: 0 };

  const shoot = BEAT * BEATS;
  const time = Math.max(0, elapsed);
  const shaking = time < shoot;

  // A firm downward beat followed by a full lift, three times in sync.
  const lift = shaking ? Math.sin(((time % BEAT) / BEAT) * Math.PI) ** 2 : 0;

  return {
    bounce: lift * 0.9,
    tilt: lift * 0.24,
    blend: Math.min(1, Math.max(0, (time - shoot) / 0.32)),
    word: shaking ? WORDS[Math.floor(time / BEAT)] : 'Shoot!',
    impact: shaking ? 0 : Math.max(0, 1 - (time - shoot) / 0.28),
  };
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
