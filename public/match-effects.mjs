// Timing and words for the moments between moves: the Rock Paper Scissors
// countdown, and the line that lands on the victory card.
//
// Pure maths and strings, so both the 3D scene and the tests can use them.

/** How long the full "rock… paper… scissors… shoot!" sequence runs, in ms. */
export const THROW_DURATION = 2700;

const BEAT = 0.72; // seconds per count
const BEATS = 3;
const WORDS = ['Rock!', 'Paper!', 'Scissors!'];

/**
 * One frame of the countdown.
 * @param {number} elapsed seconds since the throw started
 * @param {boolean} reduced honour prefers-reduced-motion: skip straight to the reveal
 * Returns swing around the forearm pivot, forward reach and finger reveal blend.
 */
const clamp01 = n => Math.max(0, Math.min(1, n));
const smooth = n => { const t=clamp01(n); return t*t*(3-2*t); };

export function throwFrame(elapsed, reduced = false) {
  if(reduced)return {bounce:0,tilt:0,swing:0,reach:.28,blend:1,word:'Shoot!',impact:0};
  const time=Math.max(0,elapsed),shoot=BEAT*BEATS;
  if(time>=shoot){
    const t=time-shoot,blend=smooth(t/.22);
    return {bounce:0,tilt:0,swing:-.055*Math.sin(Math.min(1,t/.3)*Math.PI),reach:.28*smooth(t/.18),blend,word:'Shoot!',impact:Math.max(0,1-t/.25)};
  }
  const phase=(time%BEAT)/BEAT;
  // Elbow stays planted: prepare, hammer down quickly, then absorb the beat.
  let swing;
  if(phase<.52)swing=.1+.6*smooth(phase/.52);
  else if(phase<.76)swing=.7-.8*((phase-.52)/.24)**2;
  else swing=-.1+.2*smooth((phase-.76)/.24);
  return {bounce:0,tilt:0,swing,reach:0,blend:0,word:WORDS[Math.floor(time/BEAT)],impact:0};
}

/** Both forearms hinge from opposite sides; neither hand translates vertically. */
export function armPose(side,frame){
  const left=side==='rose';
  return {x:left?-3:3,y:-.3,angle:(left?-Math.PI/2:Math.PI/2)+(left?1:-1)*frame.swing,extension:1.25+frame.reach};
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
