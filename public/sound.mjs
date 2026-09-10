// Every sound in the arcade, synthesised on the fly.
//
// Browsers only allow audio after a real interaction, so the context is created
// lazily and `unlock()` is wired to the first pointer or key event. Callers ask
// for a chime; this module decides whether one is allowed right now.

/**
 * @param {() => boolean} isEnabled reads the player's Sound on/off preference.
 */
export function createAudio(isEnabled) {
  let context = null;

  function unlock() {
    try {
      const AudioConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioConstructor) return;
      if (!context) context = new AudioConstructor();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch {
      /* Audio is a nicety; never let it break play. */
    }
  }

  /** Play a short shaped tone. */
  function tone({ frequency, at, type = 'sine', peak = 0.06, length = 0.2 }) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    oscillator.start(at);
    oscillator.stop(at + length + 0.02);
  }

  function playable() {
    return isEnabled() && context && context.state === 'running';
  }

  return {
    unlock,

    /** True once the context exists and is running. */
    get ready() {
      return playable();
    },

    /** A two-note rise for messages, a single soft note for moves and turns. */
    chime(message = true) {
      if (!playable()) return;
      try {
        const notes = message ? [660, 880] : [520];
        notes.forEach((frequency, index) => {
          tone({ frequency, at: context.currentTime + index * 0.13 });
        });
      } catch {
        /* ignore */
      }
    },

    /** A little four-note fanfare for a win. */
    fanfare() {
      unlock();
      if (!playable()) return;
      try {
        [261.63, 329.63, 392, 523.25].forEach((frequency, index) => {
          tone({ frequency, at: context.currentTime + index * 0.1, type: 'triangle', peak: 0.07, length: 0.5 });
        });
      } catch {
        /* ignore */
      }
    },

    /** Resume after the settings dialog asks for a test sound. */
    async resume() {
      unlock();
      if (context?.state === 'suspended') await context.resume().catch(() => {});
    },
  };
}
