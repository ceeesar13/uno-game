// ==== SOUND DESIGN ====
// Every sound is synthesized in code with the Web Audio API: no audio files,
// no licenses, no network. Volume follows the emotional hierarchy of the game:
// ordinary plays are short and quiet, penalties and endings are big.
//
// Pure half (tested in Node): sfxForCard / snapshotOf / transitionSounds decide
// WHICH sound belongs to a moment. Impure half (browser only): init / play /
// setMuted actually make noise.

// ---- Pure: what should sound ----

const CARD_SFX = {
  number: 'play',
  'draw-two': 'drawTwo',
  'wild-draw-four': 'drawFour',
  skip: 'skip',
  reverse: 'reverse',
  wild: 'wild',
};

/** Sound name for a played card. */
export function sfxForCard(card) {
  return CARD_SFX[card.type] || 'play';
}

/** Reduce full engine state to the fields transition cues depend on. */
export function snapshotOf(state) {
  return {
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    winner: state.winner,
    handCounts: state.players.map((p) => p.hand.length),
  };
}

/**
 * Emotional cues derived from a state transition:
 * - 'turn'    — the turn just passed to the human (heads-up chime)
 * - 'tension' — someone just dropped to exactly one card (the "UNO!" moment)
 * - 'win' / 'lose' — the game just ended, from the human's perspective
 */
export function transitionSounds(prev, next) {
  const out = [];
  if (!prev || !next) return out;

  if (next.phase === 'turn' && next.currentPlayer === 0 && prev.currentPlayer !== 0) {
    out.push('turn');
  }

  const crossed = next.handCounts.some((n, i) => n === 1 && prev.handCounts[i] > 1);
  if (crossed && next.phase !== 'game-over') out.push('tension');

  if (next.phase === 'game-over' && prev.phase !== 'game-over') {
    out.push(next.winner === 0 ? 'win' : 'lose');
  }

  return out;
}

// ---- Impure: how it sounds (browser only) ----

let ctx = null;
let master = null;
let muted = false;
let lastSnapshot = null;

function ensureContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

// A tone with its own gain envelope. All times are relative seconds.
function tone(type, freq, { at = 0, dur = 0.1, vol = 0.2, to = null } = {}) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// A pitched noise burst (the physical "card" sounds).
function noise({ at = 0, dur = 0.07, vol = 0.2, freq = 1800, q = 1.2, rate = 1 } = {}) {
  const t0 = ctx.currentTime + at;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

// ±5% pitch variation so repeated sounds stay organic instead of mechanical.
function vary() {
  return 0.95 + Math.random() * 0.1;
}

const RECIPES = {
  // The heartbeat of the table: a dry card snap.
  play() {
    noise({ dur: 0.06, vol: 0.22, freq: 1900 * vary(), q: 1.1 });
    noise({ at: 0.012, dur: 0.05, vol: 0.1, freq: 900 * vary(), q: 2 });
  },
  // Softer slide: taking a card is yielding, it sounds smaller than playing.
  draw() {
    noise({ dur: 0.1, vol: 0.12, freq: 750 * vary(), q: 0.8, rate: 0.85 });
  },
  // Gentle two-note chime: your turn, no urgency.
  turn() {
    tone('sine', 659, { dur: 0.09, vol: 0.16 });
    tone('sine', 880, { at: 0.1, dur: 0.14, vol: 0.16 });
  },
  // Punchy hit for +2.
  drawTwo() {
    tone('sawtooth', 300 * vary(), { dur: 0.2, vol: 0.4, to: 140 });
    noise({ dur: 0.09, vol: 0.28, freq: 300, q: 0.9 });
  },
  // The +4 lands deeper and longer: the biggest blow in the game.
  drawFour() {
    tone('sawtooth', 220 * vary(), { dur: 0.32, vol: 0.5, to: 70 });
    tone('square', 110, { at: 0.05, dur: 0.28, vol: 0.22, to: 55 });
    noise({ dur: 0.12, vol: 0.32, freq: 220, q: 0.8 });
  },
  // Two quick falling blips: denied.
  skip() {
    tone('square', 520, { dur: 0.07, vol: 0.2 });
    tone('square', 370, { at: 0.08, dur: 0.09, vol: 0.2 });
  },
  // A sweep up then down: the direction turning around.
  reverse() {
    tone('sine', 330, { dur: 0.13, vol: 0.24, to: 660 });
    tone('sine', 660, { at: 0.13, dur: 0.15, vol: 0.24, to: 330 });
  },
  // Ascending sparkle: a wild is power, not aggression.
  wild() {
    tone('sine', 523, { dur: 0.08, vol: 0.18 });
    tone('sine', 659, { at: 0.07, dur: 0.08, vol: 0.18 });
    tone('sine', 784, { at: 0.14, dur: 0.16, vol: 0.18 });
  },
  // Soft corrective buzz — losing points already hurts enough.
  error() {
    tone('triangle', 130, { dur: 0.13, vol: 0.16, to: 95 });
  },
  // Short riser: someone is one card from winning.
  tension() {
    tone('sawtooth', 200, { dur: 0.34, vol: 0.14, to: 620 });
  },
  // Four-note fanfare.
  win() {
    tone('triangle', 523, { dur: 0.12, vol: 0.3 });
    tone('triangle', 659, { at: 0.11, dur: 0.12, vol: 0.3 });
    tone('triangle', 784, { at: 0.22, dur: 0.12, vol: 0.3 });
    tone('triangle', 1046, { at: 0.33, dur: 0.3, vol: 0.34 });
  },
  // Sober two-note descent — losing to a bot should sting, not humiliate.
  lose() {
    tone('triangle', 440, { dur: 0.18, vol: 0.24 });
    tone('triangle', 330, { at: 0.2, dur: 0.3, vol: 0.22 });
  },
};

/** Play a named sound. Safe to call anywhere: silent until init + user gesture. */
export function play(name) {
  if (muted || !ctx || !RECIPES[name]) return;
  RECIPES[name]();
}

/** Play the cue for a played card. */
export function playCard(card) {
  play(sfxForCard(card));
}

/** Derive and play transition cues for a fresh render of `state`. */
export function onRender(state) {
  const next = snapshotOf(state);
  for (const name of transitionSounds(lastSnapshot, next)) play(name);
  lastSnapshot = next;
}

/** Forget the previous snapshot (call when a new round starts). */
export function resetTransitions() {
  lastSnapshot = null;
}

export function isMuted() {
  return muted;
}

export function setMuted(value) {
  muted = Boolean(value);
  try {
    localStorage.setItem('uno.muted', muted ? '1' : '0');
  } catch (e) {
    /* ignore */
  }
}

/**
 * Arm the audio system: restore the mute preference and create the
 * AudioContext on the first user gesture (autoplay policies require it).
 */
export function init() {
  try {
    muted = localStorage.getItem('uno.muted') === '1';
  } catch (e) {
    /* ignore */
  }
  const arm = () => ensureContext();
  document.addEventListener('pointerdown', arm, { once: true });
  document.addEventListener('keydown', arm, { once: true });
}
