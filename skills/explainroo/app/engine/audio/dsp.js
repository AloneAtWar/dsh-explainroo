// Small DSP helpers shared by the music and sound-effect synths.

export const mtof = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
export const dbToGain = (db) => Math.pow(10, db / 20);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Look-ahead peak limiter applied to rendered channel data in place.
// Returns the fraction of samples that needed gain reduction.
export function limitInPlace(channels, sampleRate, { ceilingDb = -1, lookaheadMs = 5, attackMs = 1, releaseMs = 90 } = {}) {
  const ceiling = dbToGain(ceilingDb);
  const n = channels[0].length;
  const req = new Float32Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of channels) {
      const v = Math.abs(c[i]);
      if (v > p) p = v;
    }
    if (p > ceiling) {
      req[i] = ceiling / p;
      any = true;
    } else {
      req[i] = 1;
    }
  }
  if (!any) return 0;

  // sliding minimum over [i, i + L]: gain starts falling before a peak arrives
  const L = Math.max(1, Math.round((lookaheadMs * sampleRate) / 1000));
  const win = new Float32Array(n);
  const dq = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && req[dq[tail - 1]] >= req[i]) tail--;
    dq[tail++] = i;
    while (dq[head] > i + L) head++;
    win[i] = req[dq[head]];
  }

  const aCoef = Math.exp(-1 / ((attackMs * sampleRate) / 1000));
  const rCoef = Math.exp(-1 / ((releaseMs * sampleRate) / 1000));
  let g = 1;
  let reduced = 0;
  for (let i = 0; i < n; i++) {
    const target = win[i];
    g = target < g ? target + (g - target) * aCoef : target + (g - target) * rCoef;
    if (g < 0.9999) reduced++;
    for (const c of channels) {
      let v = c[i] * g;
      if (v > ceiling) v = ceiling;
      else if (v < -ceiling) v = -ceiling;
      c[i] = v;
    }
  }
  return reduced / n;
}

// Short fades at both edges so the file never starts or stops on a click.
export function fadeEdges(channels, sampleRate, inSeconds = 0.004, outSeconds = 0.015) {
  const n = channels[0].length;
  const fi = Math.min(n, Math.floor(inSeconds * sampleRate));
  const fo = Math.min(n, Math.floor(outSeconds * sampleRate));
  for (const c of channels) {
    for (let i = 0; i < fi; i++) c[i] *= i / fi;
    for (let i = 0; i < fo; i++) c[n - 1 - i] *= i / fo;
  }
}
