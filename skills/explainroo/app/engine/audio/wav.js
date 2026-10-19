// 16-bit PCM stereo WAV encoder for rendered AudioBuffers.

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

const toInt16 = (x) => {
  const s = x > 1 ? 1 : x < -1 ? -1 : x;
  return s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
};

export function encodeWav(buffer) {
  const n = buffer.length;
  const sr = buffer.sampleRate;
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const dataBytes = n * 4;
  const out = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(out);
  const str = (o, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  if (LITTLE_ENDIAN) {
    const pcm = new Int16Array(out, 44, n * 2);
    for (let i = 0, j = 0; i < n; i++, j += 2) {
      pcm[j] = toInt16(left[i]);
      pcm[j + 1] = toInt16(right[i]);
    }
  } else {
    for (let i = 0, o = 44; i < n; i++, o += 4) {
      v.setInt16(o, toInt16(left[i]), true);
      v.setInt16(o + 2, toInt16(right[i]), true);
    }
  }
  return out;
}
