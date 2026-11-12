/**
 * sound.js — small synthesized board sounds (no audio files).
 *
 * A short filtered noise burst sounds like a piece touching wood; captures
 * are lower and heavier, checks add a soft tone, and the end of a game
 * plays a short two-note chime.
 */

let ctx = null;
let enabled = true;

export function setSoundEnabled(on) {
  enabled = !!on;
}

function audio() {
  if (!enabled) return null;
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** A "tock": band-passed noise with a fast decay. */
function knock(ac, { freq, gain, duration }) {
  const length = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;

  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.2;
  const amp = ac.createGain();
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start();
}

function tone(ac, { freq, start = 0, duration = 0.18, gain = 0.08 }) {
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const amp = ac.createGain();
  const t = ac.currentTime + start;
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Play the sound for a chess.js verbose move. */
export function playMoveSound(move, { gameOver = false } = {}) {
  const ac = audio();
  if (!ac || !move) return;
  if (move.captured) knock(ac, { freq: 900, gain: 1.4, duration: 0.12 });
  else knock(ac, { freq: 1500, gain: 1.0, duration: 0.07 });
  if (move.san.includes('+') || move.san.includes('#')) tone(ac, { freq: 880, start: 0.03 });
  if (gameOver) {
    tone(ac, { freq: 523, start: 0.15, duration: 0.3 });
    tone(ac, { freq: 659, start: 0.3, duration: 0.45 });
  }
}
