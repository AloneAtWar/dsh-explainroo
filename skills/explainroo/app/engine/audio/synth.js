// Deterministic sample-level synthesis core. Everything is plain JavaScript:
// voices are summed in scheduling order, so the same schedule always produces
// the same samples (Web Audio sums node inputs in an unspecified order).
//
// A Synth owns lanes (mono instrument buses with filter, pump, pan and a
// reverb send, or stereo buses for sound effects) and voices (short-lived
// oscillator/noise stacks with their own envelopes and optional filter).
// It renders block by block into caller-provided stereo buffers.

export const BLOCK = 256;
const TWO_PI = Math.PI * 2;

// --- sine table ----------------------------------------------------------------

const TABLE = 4096;
const SINE = new Float64Array(TABLE + 1);
for (let i = 0; i <= TABLE; i++) SINE[i] = Math.sin((TWO_PI * i) / TABLE);

// --- envelopes (AudioParam-style automation, evaluated per sample) --------------

const HOLD = 0;
const LIN = 1;
const EXP = 2;
const TARGET = 3;

export class Env {
  constructor(initial = 0) {
    this.initial = initial;
    this.events = [];
  }
  set(v, t) {
    this.events.push([HOLD, t, v, 0]);
    return this;
  }
  lin(v, t) {
    this.events.push([LIN, t, v, 0]);
    return this;
  }
  exp(v, t) {
    this.events.push([EXP, t, v, 0]);
    return this;
  }
  target(v, t, tau) {
    this.events.push([TARGET, t, v, tau]);
    return this;
  }

  // Prepare for sequential evaluation starting at absolute sample `from`.
  begin(sr, from) {
    this.ev = this.events
      .map((e, i) => ({ k: e[0], s: Math.max(0, Math.round(e[1] * sr)), v: e[2], c: e[0] === TARGET ? Math.exp(-1 / (Math.max(1e-5, e[3]) * sr)) : 0, i }))
      .sort((a, b) => a.s - b.s || a.i - b.i);
    this.idx = 0;
    this.n = from;
    this.v = this.initial;
    this.mode = HOLD;
    this.dv = 0;
    this.ratio = 1;
    this.tv = 0;
    this.tc = 0;
    this.targeting = false;
    this._process();
  }

  _process() {
    const ev = this.ev;
    while (this.idx < ev.length && ev[this.idx].s <= this.n) {
      const e = ev[this.idx++];
      if (e.k === TARGET) {
        this.targeting = true;
        this.tv = e.v;
        this.tc = e.c;
      } else {
        this.v = e.v;
        this.targeting = false;
      }
    }
    const next = ev[this.idx];
    this.nextS = next ? next.s : Infinity;
    this.mode = this.targeting ? TARGET : HOLD;
    if (next && (next.k === LIN || next.k === EXP)) {
      const len = next.s - this.n;
      if (next.k === EXP && this.v > 0 && next.v > 0) {
        this.mode = EXP;
        this.ratio = Math.pow(next.v / this.v, 1 / len);
      } else {
        this.mode = LIN;
        this.dv = (next.v - this.v) / len;
      }
    }
  }

  fill(out, count) {
    let v = this.v;
    let n = this.n;
    let mode = this.mode;
    for (let k = 0; k < count; k++) {
      if (n >= this.nextS) {
        this.v = v;
        this.n = n;
        this._process();
        v = this.v;
        mode = this.mode;
      }
      out[k] = v;
      if (mode === LIN) v += this.dv;
      else if (mode === EXP) v *= this.ratio;
      else if (mode === TARGET) v = this.tv + (v - this.tv) * this.tc;
      n++;
    }
    this.v = v;
    this.n = n;
  }
}

// --- oscillator helpers -----------------------------------------------------------

function polyblep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}

export const WAVES = { sine: 0, saw: 1, tri: 2, square: 3, noise: 4, pink: 5 };

// --- biquad (RBJ cookbook) ------------------------------------------------------------

export function biquadCoefs(type, freq, q, sr, c) {
  const f = Math.min(Math.max(freq, 10), sr * 0.45);
  const w0 = (TWO_PI * f) / sr;
  const cs = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.max(0.05, q));
  let b0;
  let b1;
  let b2;
  if (type === 'highpass') {
    b0 = (1 + cs) / 2;
    b1 = -(1 + cs);
    b2 = (1 + cs) / 2;
  } else if (type === 'bandpass') {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  } else {
    b0 = (1 - cs) / 2;
    b1 = 1 - cs;
    b2 = (1 - cs) / 2;
  }
  const a0 = 1 + alpha;
  c.b0 = b0 / a0;
  c.b1 = b1 / a0;
  c.b2 = b2 / a0;
  c.a1 = (-2 * cs) / a0;
  c.a2 = (1 - alpha) / a0;
}

// Transposed direct form II, in place over buf[0..count).
function biquadRun(c, buf, from, to) {
  const { b0, b1, b2, a1, a2 } = c;
  let z1 = c.z1;
  let z2 = c.z2;
  for (let k = from; k < to; k++) {
    const x = buf[k];
    const y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    buf[k] = y;
  }
  c.z1 = z1;
  c.z2 = z2;
}

export function makeFilter(type, freq, q = 0.707) {
  return { type, freq, q, b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, z1: 0, z2: 0, lastF: -1 };
}

// --- voices ---------------------------------------------------------------------------

// A voice is a stack of layers summed, optionally filtered, then written to its
// lane (mono) or panned into it (stereo lanes).
//   layer: { wave, freq: number, freqEnv?: Env (Hz, overrides freq), detune (cents),
//            amp: Env, fm?: { ratio, depth: Env (Hz) }, seed }
//   filter: { type, freq, freqEnv?: Env, q }
export class Voice {
  constructor(t0, t1) {
    this.t0 = t0;
    this.t1 = t1;
    this.layers = [];
    this.filter = null;
    this.pan = 0;
    this.panEnv = null;
  }
  layer(spec) {
    this.layers.push(spec);
    return this;
  }
}

// --- reverb (Freeverb topology, block processed) ---------------------------------------------

const COMBS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASSES = [556, 441, 341, 225];
const SPREAD = 23;

export class Reverb {
  constructor(sr, { room = 0.8, damp = 0.35, preDelay = 0.02, lowCut = 200 } = {}) {
    const scale = sr / 44100;
    const line = (d) => ({ buf: new Float32Array(Math.max(1, Math.round(d * scale))), i: 0, fs: 0 });
    this.combs = COMBS.map(line);
    this.aps = [ALLPASSES.map(line), ALLPASSES.map((d) => line(d + SPREAD))];
    this.fb = room * 0.28 + 0.7;
    this.damp = damp * 0.4;
    this.pre = new Float32Array(Math.max(1, Math.round(preDelay * sr)));
    this.preI = 0;
    this.hpA = Math.exp((-TWO_PI * lowCut) / sr);
    this.hpX = 0;
    this.hpY = 0;
    this.inBuf = new Float32Array(BLOCK);
    this.wet = new Float32Array(BLOCK);
    this.chBuf = new Float32Array(BLOCK);
    // after this many silent input samples the tail is below -100 dB: skip work
    this.tailSamples = Math.round(sr * (0.4 + 12 * (1 / (1 - this.fb)) * (1116 * scale) / sr));
    this.silent = this.tailSamples;
  }

  // Adds the wet signal (times `level`) for mono `input[0..n)` into outL/outR.
  process(input, n, outL, outR, level) {
    let loud = false;
    for (let k = 0; k < n; k++) {
      if (input[k] !== 0) {
        loud = true;
        break;
      }
    }
    if (loud) this.silent = 0;
    else if (this.silent >= this.tailSamples) return;
    else this.silent += n;

    const x = this.inBuf;
    const pre = this.pre;
    let pi = this.preI;
    let hx = this.hpX;
    let hy = this.hpY;
    const a = this.hpA;
    for (let k = 0; k < n; k++) {
      const d = pre[pi];
      pre[pi] = input[k];
      pi = pi + 1 === pre.length ? 0 : pi + 1;
      hy = a * (hy + d - hx);
      hx = d;
      x[k] = hy * 0.015;
    }
    this.preI = pi;
    this.hpX = hx;
    this.hpY = hy;

    const fb = this.fb;
    const damp = this.damp;
    const damp1 = 1 - damp;
    const wet = this.wet;
    wet.fill(0, 0, n);
    for (const c of this.combs) {
      const buf = c.buf;
      const len = buf.length;
      let i = c.i;
      let fs = c.fs;
      for (let k = 0; k < n; k++) {
        const o = buf[i];
        fs = o * damp1 + fs * damp;
        buf[i] = x[k] + fs * fb;
        if (++i === len) i = 0;
        wet[k] += o;
      }
      c.i = i;
      c.fs = fs;
    }
    const outs = [outL, outR];
    const g = level * 3;
    for (let ch = 0; ch < 2; ch++) {
      const y = this.chBuf;
      y.set(wet.subarray(0, n));
      for (const ap of this.aps[ch]) {
        const buf = ap.buf;
        const len = buf.length;
        let i = ap.i;
        for (let k = 0; k < n; k++) {
          const bo = buf[i];
          const inp = y[k];
          buf[i] = inp + bo * 0.5;
          y[k] = bo - inp;
          if (++i === len) i = 0;
        }
        ap.i = i;
      }
      const out = outs[ch];
      for (let k = 0; k < n; k++) out[k] += y[k] * g;
    }
  }
}

// --- glue compressor (stereo linked, feed-forward, soft knee) ---------------------------------

export class Compressor {
  constructor(sr, { threshold = -20, ratio = 2, knee = 10, attack = 0.02, release = 0.3, makeupDb = 0 } = {}) {
    this.t = threshold;
    this.r = ratio;
    this.k = knee;
    this.att = Math.exp(-1 / (attack * sr));
    this.rel = Math.exp(-1 / (release * sr));
    this.env = 0;
    this.makeup = Math.pow(10, makeupDb / 20);
    this.gain = 1;
  }
  process(L, R, n) {
    let env = this.env;
    let g = this.gain;
    for (let k = 0; k < n; k++) {
      const p = Math.max(Math.abs(L[k]), Math.abs(R[k]));
      env = p > env ? p + (env - p) * this.att : p + (env - p) * this.rel;
      if ((k & 7) === 0) {
        const lvl = 20 * Math.log10(env + 1e-9);
        const over = lvl - this.t;
        let gr = 0;
        if (over > this.k / 2) gr = (1 / this.r - 1) * over;
        else if (over > -this.k / 2) {
          const x = over + this.k / 2;
          gr = ((1 / this.r - 1) * x * x) / (2 * this.k);
        }
        g = Math.pow(10, gr / 20) * this.makeup;
      }
      L[k] *= g;
      R[k] *= g;
    }
    this.env = env;
    this.gain = g;
  }
}

// --- lanes ---------------------------------------------------------------------------------

export class Lane {
  constructor(synth, spec = {}) {
    this.synth = synth;
    this.stereo = !!spec.stereo;
    this.gain = spec.gain ?? 1;
    this.panBase = spec.pan ?? 0;
    this.panLfo = spec.panLfo || null;
    this.send = spec.reverb || 0;
    this.filter = spec.filter ? makeFilter(spec.filter.type, spec.filter.freq, spec.filter.q ?? 0.707) : null;
    this.filterLfo = spec.filter && spec.filter.lfo ? spec.filter.lfo : null;
    this.pumpTimes = spec.pump ? [] : null;
    this.pumpI = 0;
    this.pumpD = 0;
    this.mono = new Float32Array(BLOCK);
    this.L = this.stereo ? new Float32Array(BLOCK) : null;
    this.R = this.stereo ? new Float32Array(BLOCK) : null;
  }

  // Ducks the lane at time t (tech-style pumping); decays back to 1.
  pump(t, depth = 0.55) {
    if (this.pumpTimes) this.pumpTimes.push([Math.round(t * this.synth.sr), depth]);
  }

  clear(n) {
    this.dirty = false;
    if (this.stereo) {
      this.L.fill(0, 0, n);
      this.R.fill(0, 0, n);
    } else {
      this.mono.fill(0, 0, n);
    }
  }

  // Mixes the block into the synth's dry buffers and the reverb input.
  mix(i0, n, dryL, dryR, send) {
    if (!this.dirty && !this.pumpTimes && (!this.filter || (Math.abs(this.filter.z1) < 1e-12 && Math.abs(this.filter.z2) < 1e-12))) return;
    const sr = this.synth.sr;
    const tMid = (i0 + n / 2) / sr;
    const g = this.gain;
    if (this.stereo) {
      const L = this.L;
      const R = this.R;
      const s = this.send;
      for (let k = 0; k < n; k++) {
        const l = L[k] * g;
        const r = R[k] * g;
        dryL[k] += l;
        dryR[k] += r;
        if (s) send[k] += (l + r) * 0.5 * s;
      }
      return;
    }
    const m = this.mono;
    if (this.filter) {
      const f = this.filter;
      const freq = this.filterLfo ? f.freq + this.filterLfo.depth * Math.sin(TWO_PI * this.filterLfo.rate * tMid) : f.freq;
      if (freq !== f.lastF) {
        biquadCoefs(f.type, freq, f.q, sr, f);
        f.lastF = freq;
      }
      biquadRun(f, m, 0, n);
    }
    if (this.pumpTimes) {
      const times = this.pumpTimes;
      const c = Math.exp(-1 / (0.07 * sr));
      let d = this.pumpD;
      let pi = this.pumpI;
      for (let k = 0; k < n; k++) {
        while (pi < times.length && times[pi][0] <= i0 + k) d = times[pi++][1];
        m[k] *= 1 - d;
        d *= c;
      }
      this.pumpD = d;
      this.pumpI = pi;
    }
    let pan = this.panBase;
    if (this.panLfo) pan += this.panLfo.depth * Math.sin(TWO_PI * this.panLfo.rate * tMid);
    pan = Math.max(-1, Math.min(1, pan));
    const x = ((pan + 1) / 2) * (Math.PI / 2);
    const gl = Math.cos(x) * g * Math.SQRT2;
    const gr = Math.sin(x) * g * Math.SQRT2;
    const s = this.send * g;
    for (let k = 0; k < n; k++) {
      const v = m[k];
      dryL[k] += v * gl;
      dryR[k] += v * gr;
      if (s) send[k] += v * s;
    }
  }
}

// --- the synth ---------------------------------------------------------------------------------

export class Synth {
  constructor(sampleRate, length, { reverb = null, reverbLevel = 0, gain = 1, highpass = 0 } = {}) {
    this.sr = sampleRate;
    this.length = length;
    this.lanes = [];
    this.pending = [];
    this.sorted = null;
    this.active = [];
    this.next = 0;
    this.reverb = reverb ? new Reverb(sampleRate, reverb) : null;
    this.reverbLevel = reverbLevel;
    this.gain = gain;
    this.hp = null;
    if (highpass > 0) {
      this.hp = [makeFilter('highpass', highpass, 0.707), makeFilter('highpass', highpass, 0.707)];
      for (const f of this.hp) biquadCoefs('highpass', highpass, 0.707, sampleRate, f);
    }
    this.send = new Float32Array(BLOCK);
    this.acc = new Float32Array(BLOCK);
    this.tmp = new Float32Array(BLOCK);
    this.amp = new Float32Array(BLOCK);
    this.fq = new Float32Array(BLOCK);
    this.dep = new Float32Array(BLOCK);
    this.pan = new Float32Array(BLOCK);
  }

  lane(spec) {
    const lane = new Lane(this, spec);
    this.lanes.push(lane);
    return lane;
  }

  add(lane, voice) {
    voice.lane = lane;
    voice.start = Math.max(0, Math.round(voice.t0 * this.sr));
    voice.end = Math.min(this.length, Math.round(voice.t1 * this.sr));
    voice.order = this.pending.length;
    if (voice.end > voice.start) this.pending.push(voice);
    return voice;
  }

  _begin(v) {
    const sr = this.sr;
    for (const L of v.layers) {
      L.amp.begin(sr, v.start);
      if (L.freqEnv) L.freqEnv.begin(sr, v.start);
      if (L.fm) L.fm.depth.begin(sr, v.start);
      L.ph = 0;
      L.mph = 0;
      L.rs = (L.seed >>> 0) || 0x9e3779b9;
      L.b0 = 0;
      L.b1 = 0;
      L.b2 = 0;
      L.mul = L.detune ? Math.pow(2, L.detune / 1200) : 1;
    }
    if (v.filter) {
      const f = v.filter;
      Object.assign(f, { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0, z1: 0, z2: 0, lastF: -1 });
      if (f.freqEnv) f.freqEnv.begin(sr, v.start);
    }
    if (v.panEnv) v.panEnv.begin(sr, v.start);
  }

  _renderVoice(v, i0, n) {
    const a = Math.max(v.start, i0);
    const b = Math.min(v.end, i0 + n);
    const cnt = b - a;
    if (cnt <= 0) return;
    const sr = this.sr;
    const acc = this.acc;
    const amp = this.amp;
    const fq = this.fq;
    acc.fill(0, 0, cnt);
    for (const L of v.layers) {
      L.amp.fill(amp, cnt);
      if (L.freqEnv) L.freqEnv.fill(fq, cnt);
      const mul = L.mul;
      const fixed = L.freq * mul;
      let ph = L.ph;
      switch (L.wave) {
        case 0: { // sine, optional FM
          if (L.fm) {
            const dep = this.dep;
            L.fm.depth.fill(dep, cnt);
            let mph = L.mph;
            const ratio = L.fm.ratio;
            for (let k = 0; k < cnt; k++) {
              const f = L.freqEnv ? fq[k] * mul : fixed;
              let x = mph * TABLE;
              let i = x | 0;
              const mod = SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i);
              mph += (f * ratio) / sr;
              mph -= Math.floor(mph);
              x = ph * TABLE;
              i = x | 0;
              acc[k] += (SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i)) * amp[k];
              ph += (f + dep[k] * mod) / sr;
              ph -= Math.floor(ph);
            }
            L.mph = mph;
          } else if (L.freqEnv) {
            for (let k = 0; k < cnt; k++) {
              const x = ph * TABLE;
              const i = x | 0;
              acc[k] += (SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i)) * amp[k];
              ph += (fq[k] * mul) / sr;
              ph -= Math.floor(ph);
            }
          } else {
            const inc = fixed / sr;
            for (let k = 0; k < cnt; k++) {
              const x = ph * TABLE;
              const i = x | 0;
              acc[k] += (SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i)) * amp[k];
              ph += inc;
              if (ph >= 1) ph -= 1;
            }
          }
          break;
        }
        case 1: { // saw (PolyBLEP)
          const env = L.freqEnv;
          let dt = fixed / sr;
          for (let k = 0; k < cnt; k++) {
            if (env) dt = (fq[k] * mul) / sr;
            let v = 2 * ph - 1;
            if (ph < dt) {
              const u = ph / dt;
              v -= u + u - u * u - 1;
            } else if (ph > 1 - dt) {
              const u = (ph - 1) / dt;
              v -= u * u + u + u + 1;
            }
            acc[k] += v * amp[k];
            ph += dt;
            if (ph >= 1) ph -= 1;
          }
          break;
        }
        case 3: { // square: difference of two band-limited saws
          const env = L.freqEnv;
          let dt = fixed / sr;
          for (let k = 0; k < cnt; k++) {
            if (env) dt = (fq[k] * mul) / sr;
            let p2 = ph + 0.5;
            if (p2 >= 1) p2 -= 1;
            const s = (2 * ph - 1 - polyblep(ph, dt) - (2 * p2 - 1 - polyblep(p2, dt))) * 0.5;
            acc[k] += s * amp[k];
            ph += dt;
            if (ph >= 1) ph -= 1;
          }
          break;
        }
        case 2: { // triangle
          const env = L.freqEnv;
          let dt = fixed / sr;
          for (let k = 0; k < cnt; k++) {
            if (env) dt = (fq[k] * mul) / sr;
            acc[k] += (4 * Math.abs(ph - 0.5) - 1) * amp[k];
            ph += dt;
            if (ph >= 1) ph -= 1;
          }
          break;
        }
        case 4: { // white noise
          let s = L.rs;
          for (let k = 0; k < cnt; k++) {
            s ^= s << 13;
            s ^= s >>> 17;
            s ^= s << 5;
            acc[k] += ((s >>> 0) / 2147483648 - 1) * amp[k];
          }
          L.rs = s;
          break;
        }
        case 5: { // pink noise (Paul Kellet economy filter)
          let s = L.rs;
          let b0 = L.b0;
          let b1 = L.b1;
          let b2 = L.b2;
          for (let k = 0; k < cnt; k++) {
            s ^= s << 13;
            s ^= s >>> 17;
            s ^= s << 5;
            const w = (s >>> 0) / 2147483648 - 1;
            b0 = 0.99765 * b0 + w * 0.099046;
            b1 = 0.963 * b1 + w * 0.2965164;
            b2 = 0.57 * b2 + w * 1.0526913;
            acc[k] += (b0 + b1 + b2 + w * 0.1848) * 0.22 * amp[k];
          }
          L.rs = s;
          L.b0 = b0;
          L.b1 = b1;
          L.b2 = b2;
          break;
        }
        default:
          break;
      }
      L.ph = ph;
    }

    if (v.filter) {
      const f = v.filter;
      if (f.freqEnv) {
        f.freqEnv.fill(fq, cnt);
        for (let k = 0; k < cnt; k += 16) {
          const e = Math.min(cnt, k + 16);
          if (fq[k] !== f.lastF) {
            const { z1, z2 } = f;
            biquadCoefs(f.type, fq[k], f.q, sr, f);
            f.z1 = z1;
            f.z2 = z2;
            f.lastF = fq[k];
          }
          biquadRun(f, acc, k, e);
        }
      } else {
        if (f.lastF !== f.freq) {
          biquadCoefs(f.type, f.freq, f.q, sr, f);
          f.lastF = f.freq;
        }
        biquadRun(f, acc, 0, cnt);
      }
    }

    const lane = v.lane;
    lane.dirty = true;
    const off = a - i0;
    if (lane.stereo) {
      const pan = this.pan;
      if (v.panEnv) v.panEnv.fill(pan, cnt);
      const L = lane.L;
      const R = lane.R;
      for (let k = 0; k < cnt; k++) {
        const p = v.panEnv ? pan[k] : v.pan;
        const x = ((Math.max(-1, Math.min(1, p)) + 1) / 2) * (Math.PI / 2);
        L[off + k] += acc[k] * Math.cos(x) * Math.SQRT2;
        R[off + k] += acc[k] * Math.sin(x) * Math.SQRT2;
      }
    } else {
      const m = lane.mono;
      for (let k = 0; k < cnt; k++) m[off + k] += acc[k];
    }
  }

  // Renders samples [i0, i0 + n) (n <= BLOCK) and ADDS them into outL/outR.
  renderBlock(i0, n, outL, outR) {
    if (!this.sorted) {
      this.sorted = this.pending.slice().sort((x, y) => x.start - y.start || x.order - y.order);
      this.next = 0;
    }
    const end = i0 + n;
    const sorted = this.sorted;
    while (this.next < sorted.length && sorted[this.next].start < end) {
      const v = sorted[this.next++];
      this._begin(v);
      this.active.push(v);
    }
    for (const lane of this.lanes) lane.clear(n);
    for (const v of this.active) this._renderVoice(v, i0, n);
    if (this.active.length) this.active = this.active.filter((v) => v.end > end);

    const send = this.send;
    send.fill(0, 0, n);
    const dryL = this.tmp;
    const dryR = this.acc;
    dryL.fill(0, 0, n);
    dryR.fill(0, 0, n);
    for (const lane of this.lanes) lane.mix(i0, n, dryL, dryR, send);
    if (this.reverb) this.reverb.process(send, n, dryL, dryR, this.reverbLevel);
    if (this.hp) {
      biquadRun(this.hp[0], dryL, 0, n);
      biquadRun(this.hp[1], dryR, 0, n);
    }
    const g = this.gain;
    for (let k = 0; k < n; k++) {
      outL[k] += dryL[k] * g;
      outR[k] += dryR[k] * g;
    }
  }
}
