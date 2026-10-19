// Instruments for the music generator. Each function adds one note (a Voice)
// to a Synth lane at time `t`.
import { Voice, Env, WAVES } from './synth.js';
import { mtof } from './dsp.js';

// Envelope: 0 -> peak (linear attack) -> exponential decay toward `sustain`,
// released exponentially at `releaseAt` with time constant `releaseTau`.
function adsr(t, peak, attack, decayTau, sustain, releaseAt, releaseTau) {
  const e = new Env(0).set(0, t).lin(peak, t + attack);
  if (decayTau > 0) e.target(peak * sustain, t + attack, decayTau);
  if (releaseAt != null) e.target(0, Math.max(t + attack, releaseAt), releaseTau);
  return e;
}

// Short percussive envelope: linear attack then exponential decay to silence.
const perc = (t, peak, attack, tau) => new Env(0).set(0, t).lin(peak, t + attack).target(0, t + attack, tau);

const nextSeed = (rng) => (rng ? Math.floor(rng.next() * 4294967295) : 0x2545f491) || 1;

// Electric piano: two-operator FM with a bark on the attack and a soft tine.
export function epiano(syn, lane, t, midi, vel, dur = 1, { level = 0.2 } = {}) {
  const f = mtof(midi);
  const decay = 1.5 * Math.pow(261.6 / f, 0.35);
  const peak = level * vel;
  const v = new Voice(t, t + dur + 0.8);
  v.layer({
    wave: WAVES.sine,
    freq: f,
    amp: adsr(t, peak, 0.004, decay * 0.45, 0.22, t + dur, 0.12),
    fm: { ratio: 1, depth: new Env(0).set(f * (0.7 + 1.3 * vel), t).target(f * 0.1, t, 0.16) },
  });
  v.layer({ wave: WAVES.sine, freq: f * 4, amp: perc(t, peak * 0.12, 0.002, 0.045) });
  syn.add(lane, v);
}

// Pad voice: two detuned saws (the lane filters them) with slow swell and release.
export function padVoice(syn, lane, t, midi, vel, dur, { attack = 0.9, release = 1.6, detune = 8, level = 0.04 } = {}) {
  const f = mtof(midi);
  const hold = t + Math.max(attack, dur);
  const peak = level * vel;
  const v = new Voice(t, hold + release * 2.6);
  for (const d of [-detune, detune]) {
    const amp = new Env(0).set(0, t).lin(peak, t + attack).set(peak, hold).target(0, hold, release / 3);
    v.layer({ wave: WAVES.saw, freq: f, detune: d, amp });
  }
  syn.add(lane, v);
}

// Plucked synth: oscillator through a per-note low-pass that closes quickly.
const WAVE_NAMES = { sawtooth: WAVES.saw, triangle: WAVES.tri, square: WAVES.square, sine: WAVES.sine };

export function pluck(syn, lane, t, midi, vel, { decay = 0.3, bright = 3200, type = 'sawtooth', level = 0.12, q = 1.2 } = {}) {
  const f = mtof(midi);
  const v = new Voice(t, t + decay * 3 + 0.05);
  v.layer({ wave: WAVE_NAMES[type] ?? WAVES.saw, freq: f, amp: perc(t, level * vel, 0.003, decay / 3.5) });
  v.filter = {
    type: 'lowpass',
    q,
    freqEnv: new Env(0).set(Math.min(bright * (0.6 + 0.6 * vel), 14000), t).target(Math.max(f * 1.3, 220), t, decay * 0.25),
  };
  syn.add(lane, v);
}

// Round bass: sine plus a quieter triangle for definition on small speakers.
export function bass(syn, lane, t, midi, vel, dur, { level = 0.22, staccato = false } = {}) {
  const f = mtof(midi);
  const peak = level * vel;
  const v = new Voice(t, t + dur + 0.3);
  const shape = () => adsr(t, peak, 0.008, staccato ? 0.08 : 0.3, staccato ? 0.45 : 0.72, t + dur, 0.045);
  v.layer({ wave: WAVES.sine, freq: f, amp: shape() });
  const tri = shape();
  tri.events = tri.events.map((e) => [e[0], e[1], e[2] * 0.35, e[3]]);
  v.layer({ wave: WAVES.tri, freq: f, amp: tri });
  syn.add(lane, v);
}

// Inharmonic partials for bells and glockenspiel: [ratio, amplitude, decay factor].
const BELL = [[1, 1, 1], [2, 0.4, 0.6], [2.76, 0.26, 0.42], [5.4, 0.1, 0.22], [8.93, 0.04, 0.12]];

export function bell(syn, lane, t, midi, vel, { decay = 2.2, level = 0.07, partials = 5 } = {}) {
  const f = mtof(midi);
  const parts = BELL.slice(0, partials).filter(([ratio]) => f * ratio < 15000);
  const longest = Math.max(...parts.map(([, , df]) => (decay * df) / 4));
  const v = new Voice(t, t + longest * 7 + 0.02);
  for (const [ratio, amp, df] of parts) v.layer({ wave: WAVES.sine, freq: f * ratio, amp: perc(t, level * vel * amp, 0.002, (decay * df) / 4) });
  syn.add(lane, v);
}

// Marimba: fundamental plus the characteristic ~3.9x partial, both short.
export function marimba(syn, lane, t, midi, vel, { level = 0.16 } = {}) {
  const f = mtof(midi);
  const tau = 0.16 * Math.pow(261.6 / f, 0.5);
  const v = new Voice(t, t + tau * 7 + 0.02);
  for (const [ratio, amp, k] of [[1, 1, 1], [3.93, 0.3, 0.2], [9.1, 0.05, 0.08]]) {
    if (f * ratio > 15000) continue;
    v.layer({ wave: WAVES.sine, freq: f * ratio, amp: perc(t, level * vel * amp, 0.0015, tau * k) });
  }
  syn.add(lane, v);
}

// --- drums -----------------------------------------------------------------

export function kick(syn, lane, t, vel, { level = 0.55 } = {}) {
  const v = new Voice(t, t + 0.6);
  v.layer({ wave: WAVES.sine, freqEnv: new Env(150).set(150, t).exp(47, t + 0.09), amp: perc(t, level * vel, 0.002, 0.085) });
  syn.add(lane, v);
}

// Noise hits share the lane filter (hat: high-pass, clap: band-pass, ...).
function noiseHit(syn, lane, t, peak, tau, rng, pink = false) {
  const v = new Voice(t, t + tau * 7 + 0.01);
  v.layer({ wave: pink ? WAVES.pink : WAVES.noise, seed: nextSeed(rng), amp: perc(t, peak, 0.001, tau) });
  syn.add(lane, v);
}

export const hat = (syn, lane, t, vel, rng, { open = false, level = 0.07 } = {}) =>
  noiseHit(syn, lane, t, level * vel, open ? 0.075 : 0.016, rng);

export const shaker = (syn, lane, t, vel, rng, { level = 0.05 } = {}) =>
  noiseHit(syn, lane, t, level * vel, 0.028, rng);

export function clap(syn, lane, t, vel, rng, { level = 0.12 } = {}) {
  const pk = level * vel;
  const amp = new Env(0).set(0, t);
  for (let k = 0; k < 3; k++) {
    const tk = t + k * 0.0105;
    amp.set(pk * (0.7 + k * 0.1), tk).target(0, tk + 0.0004, 0.0025);
  }
  const tail = t + 0.0315;
  amp.set(pk, tail).target(0, tail, 0.05);
  const v = new Voice(t, tail + 0.4);
  v.layer({ wave: WAVES.noise, seed: nextSeed(rng), amp });
  syn.add(lane, v);
}

// Soft cymbal wash for section starts and the final hit.
export const crash = (syn, lane, t, vel, rng, { level = 0.05 } = {}) =>
  noiseHit(syn, lane, t, level * vel, 0.55, rng);

// Filtered-noise swell that peaks at `t` (used before scene changes).
export function swell(syn, lane, t, vel, rng, { length = 0.9, level = 0.05 } = {}) {
  const start = Math.max(0, t - length);
  const v = new Voice(start, t + 0.6);
  v.layer({ wave: WAVES.pink, seed: nextSeed(rng), amp: new Env(0).set(0.0001, start).exp(level * vel, t).target(0, t, 0.08) });
  v.filter = { type: 'bandpass', q: 0.9, freqEnv: new Env(500).set(500, start).exp(3200, t) };
  syn.add(lane, v);
}
