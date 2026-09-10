// The win overlay.
//
// Kept apart from app.mjs so the logic that decides *when* a result is shown —
// the part that used to quietly reopen itself on every poll — can be driven
// directly from a test with a stand-in document.

import { victoryCopy } from './match-effects.mjs';

export const CONFETTI_PIECES = 36;

/** Confetti is mostly hearts, with flowers and the occasional lovebug. */
export function confettiFace(index) {
  if (index % 9 === 0) return '🐞';
  if (index % 3 === 0) return '✿';
  return '♥';
}

/**
 * A stable identity for one result. Polling produces the same key over and
 * over, so a dismissed celebration stays dismissed until something changes.
 */
export function celebrationKey({ generation, game, outcome, ply = 0, round = 0 }) {
  return `${generation}:${game}:${outcome}:${ply}:${round}`;
}

/**
 * @param {object} options
 * @param {(selector: string) => any} options.query   element lookup ($ in the app)
 * @param {() => boolean} options.reducedMotion       skip confetti when true
 * @param {(copy: object) => void} options.onShow     side effects: sound, lovebugs
 * @param {typeof document} options.doc               element factory
 */
export function createCelebration({ query, reducedMotion = () => false, onShow = () => {}, doc = document }) {
  let shownKey = null;

  function close() {
    query('#victory').hidden = true;
    query('#victoryConfetti').replaceChildren();
  }

  function confetti() {
    const stage = query('#victoryConfetti');
    stage.replaceChildren();
    if (reducedMotion()) return;
    for (let i = 0; i < CONFETTI_PIECES; i++) {
      const chip = doc.createElement('span');
      chip.textContent = confettiFace(i);
      chip.style.setProperty('--x', `${Math.random() * 100}vw`);
      chip.style.setProperty('--delay', `${Math.random() * 0.5}s`);
      chip.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
      stage.append(chip);
    }
  }

  return {
    /**
     * Show, keep or clear the overlay for the current game state.
     * @returns {boolean} true when a new result was just revealed.
     */
    update({ key, outcome, game, names, throwing = false, matchOver = false }) {
      if (!outcome) {
        shownKey = null;
        close();
        return false;
      }
      // Wait for the Rock Paper Scissors countdown, and never reopen a result
      // the player has already dismissed.
      if (shownKey === key || throwing) return false;
      shownKey = key;

      const copy = victoryCopy(outcome, names, game);
      if (game === 'rps' && outcome !== 'draw') {
        copy.result = matchOver ? 'WINS THE MATCH!' : 'WINS THIS THROW!';
      }
      query('#victoryBang').textContent = copy.bang;
      query('#victoryName').textContent = copy.headline;
      query('#victoryResult').textContent = copy.result;
      query('#victoryNote').textContent = copy.note;
      query('#victory').hidden = false;
      confetti();
      onShow(copy);
      return true;
    },

    /** Dismiss, and remember it so polling does not bring it back. */
    close,

    /** Forget the last result — used when leaving a room. */
    reset() {
      shownKey = null;
      close();
    },
  };
}
