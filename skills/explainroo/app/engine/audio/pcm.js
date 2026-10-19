// WAV parsing and resampling in plain JavaScript, so narration can be loaded
// the same way in a page and in Node.

// Returns { sampleRate, channels: Float32Array[] } for PCM (8/16/24/32-bit)
// and IEEE float (32/64-bit) WAV files, including WAVE_FORMAT_EXTENSIBLE.
export function parseWav(arrayBuffer) {
  const v = new DataView(arrayBuffer);
  const tag = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (v.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a WAV file');
  let fmt = null;
  let data = null;
  let off = 12;
  while (off + 8 <= v.byteLength) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === 'fmt ') {
      let format = v.getUint16(body, true);
      if (format === 0xfffe && size >= 26) format = v.getUint16(body + 24, true);
      fmt = { format, channels: v.getUint16(body + 2, true), sampleRate: v.getUint32(body + 4, true), bits: v.getUint16(body + 14, true) };
    } else if (id === 'data') {
      data = { offset: body, size: Math.min(size, v.byteLength - body) };
    }
    off = body + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('WAV file has no fmt or data chunk');
  const { format, channels, bits } = fmt;
  const bytes = bits / 8;
  const frames = Math.floor(data.size / (bytes * channels));
  const out = Array.from({ length: channels }, () => new Float32Array(frames));
  let p = data.offset;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      let s;
      if (format === 3) s = bits === 64 ? v.getFloat64(p, true) : v.getFloat32(p, true);
      else if (bits === 16) s = v.getInt16(p, true) / 32768;
      else if (bits === 24) {
        const x = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16);
        s = x / 8388608;
      } else if (bits === 32) s = v.getInt32(p, true) / 2147483648;
      else if (bits === 8) s = (v.getUint8(p) - 128) / 128;
      else throw new Error(`unsupported WAV bit depth ${bits}`);
      out[c][i] = s;
      p += bytes;
    }
  }
  if (format !== 1 && format !== 3) throw new Error(`unsupported WAV format ${format}`);
  return { sampleRate: fmt.sampleRate, channels: out };
}

export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i];
  for (let i = 0; i < n; i++) out[i] /= channels.length;
  return out;
}

// Windowed-sinc (Lanczos, a = 8) resampler with a precomputed kernel table.
const A = 8;
const STEPS = 2048;
const KERNEL = new Float64Array(A * STEPS + 2);
for (let i = 0; i < KERNEL.length; i++) {
  const d = i / STEPS;
  KERNEL[i] = d === 0 ? 1 : d < A ? (A * Math.sin(Math.PI * d) * Math.sin((Math.PI * d) / A)) / (Math.PI * Math.PI * d * d) : 0;
}

export function resample(input, from, to) {
  if (from === to) return input;
  const ratio = from / to;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  const scale = Math.min(1, to / from);
  const support = A / scale;
  const n = input.length;
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const j0 = Math.max(0, Math.floor(x - support) + 1);
    const j1 = Math.min(n - 1, Math.floor(x + support));
    let sum = 0;
    let wsum = 0;
    for (let j = j0; j <= j1; j++) {
      const d = Math.abs(x - j) * scale;
      if (d >= A) continue;
      const w = KERNEL[Math.round(d * STEPS)];
      sum += input[j] * w;
      wsum += w;
    }
    out[i] = wsum ? sum / wsum : 0;
  }
  return out;
}
