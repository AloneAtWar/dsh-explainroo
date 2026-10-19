// Keys, scales, chords and voice leading for the music generator.

export const KEYS = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};
export const KEY_LABELS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];
export const PENTATONIC = [0, 2, 4, 7, 9];

const mod = (n, m) => ((n % m) + m) % m;

// Accepts 'F', 'Bb', 'f#', 'Eb major' or a pitch-class number.
export function parseKey(key) {
  if (key == null || key === '') return null;
  if (typeof key === 'number' && Number.isFinite(key)) return mod(Math.round(key), 12);
  const raw = String(key).trim().replace(/\s*maj(or)?$/i, '');
  const norm = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (!(norm in KEYS)) {
    throw new Error(`Unknown music key "${key}". Use one of: ${Object.keys(KEYS).join(', ')}`);
  }
  return KEYS[norm];
}

// MIDI note of a major-scale degree (0 = tonic; may be negative or above 6)
// relative to the tonic MIDI note.
export function scaleNote(tonicMidi, degree) {
  return tonicMidi + Math.floor(degree / 7) * 12 + MAJOR[mod(degree, 7)];
}

// MIDI note of a major-pentatonic step relative to the tonic MIDI note.
export function pentaNote(tonicMidi, step) {
  return tonicMidi + Math.floor(step / 5) * 12 + PENTATONIC[mod(step, 5)];
}

// A chord is { deg, seventh?, ninth?, sus2?, sus4? } on the major scale.
// Returns pitch classes with the root first and the colour tones last.
export function chordPcs(keyRoot, chord) {
  const degs = [0, 2, 4];
  if (chord.sus4) degs[1] = 3;
  if (chord.sus2) degs[1] = 1;
  if (chord.seventh) degs.push(6);
  if (chord.ninth) degs.push(8);
  return degs.map((d) => mod(keyRoot + MAJOR[mod(chord.deg + d, 7)], 12));
}

export const rootPc = (keyRoot, chord) => mod(keyRoot + MAJOR[mod(chord.deg, 7)], 12);

// Bass register A1..G#2.
export const bassMidi = (pc) => 33 + mod(pc - 9, 12);

// Nearest MIDI note with pitch class `pc` to `near`.
export function nearestWithPc(pc, near) {
  const base = near - mod(near - pc, 12);
  return near - base <= 6 ? base : base + 12;
}

// Choose `voices` chord tones inside [low, high] that cover the chord and move
// as little as possible from the previous voicing.
export function voiceChord(pcs, prev, { low = 53, high = 77, voices = 4 } = {}) {
  const cands = [];
  for (let m = low; m <= high; m++) if (pcs.includes(m % 12)) cands.push(m);
  const n = Math.min(voices, cands.length);
  let best = null;
  let bestCost = Infinity;
  const combo = [];
  const center = (low + high) / 2;

  const evaluate = () => {
    const covered = new Set(combo.map((m) => m % 12));
    let cost = 0;
    for (let k = 1; k < pcs.length; k++) if (!covered.has(pcs[k])) cost += 6;
    if (!covered.has(pcs[0])) cost += 1.5;
    for (let i = 1; i < combo.length; i++) {
      const gap = combo[i] - combo[i - 1];
      if (gap < 2) cost += 5;
      if (gap > 9) cost += gap - 9;
      if (combo[i - 1] < 57 && gap < 4) cost += 3; // muddy low seconds and thirds
    }
    if (prev && prev.length === combo.length) {
      for (let i = 0; i < combo.length; i++) cost += Math.abs(combo[i] - prev[i]) * 0.7;
    } else {
      const avg = combo.reduce((a, b) => a + b, 0) / combo.length;
      cost += Math.abs(avg - center) * 0.5;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = combo.slice();
    }
  };

  const walk = (start) => {
    if (combo.length === n) {
      evaluate();
      return;
    }
    for (let i = start; i < cands.length; i++) {
      combo.push(cands[i]);
      walk(i + 1);
      combo.pop();
    }
  };
  walk(0);
  return best || [];
}
