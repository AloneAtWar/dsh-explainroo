// Xiaomi MiMo TTS. The API is only OpenAI-shaped: POST /v1/chat/completions
// with an audio field, and the mp3 comes back as base64 on the assistant message.
// A style note is a user message, so the voice does not read it aloud.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { findEnv } from 'explainroo/src/env.js';
import { ProjectError } from 'explainroo/src/project.js';
import { ffmpeg } from 'explainroo/src/ffmpeg.js';
import { readWav } from 'explainroo/src/wav.js';

export const MIMO_MODEL = 'mimo-v2.5-tts';
export const MIMO_DEFAULT_HOST = 'api.xiaomimimo.com';
export const MIMO_VOICES = ['mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'];
const SAMPLE_RATE = 24000;

export function mimoHost(host) {
  const cleaned = String(host || MIMO_DEFAULT_HOST).trim().replace(/\/+$/, '').replace(/^https?:\/\//i, '');
  if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(cleaned)) {
    throw new ProjectError('voice.host must be a host name like api.xiaomimimo.com');
  }
  return cleaned;
}

export function mimoEndpoint(host) {
  return `https://${mimoHost(host)}/v1/chat/completions`;
}

export function buildMimoBody(text, { voice, model = MIMO_MODEL, style } = {}) {
  const messages = [];
  const trimmed = typeof style === 'string' ? style.trim() : '';
  if (trimmed) messages.push({ role: 'user', content: trimmed });
  messages.push({ role: 'assistant', content: text });
  return { model, messages, audio: { format: 'mp3', voice } };
}

function apiKey(dir) {
  const key = findEnv('MIMO_TTS_API_KEY', dir);
  if (!key) throw new ProjectError('MiMo needs an API key. Set MIMO_TTS_API_KEY or put MIMO_TTS_API_KEY=... in a .env file in the project or explainroo folder.');
  return key;
}

function unreadable() {
  throw new ProjectError('MiMo returned unreadable audio. Try the voice command again.');
}

export function base64ToBytes(b64) {
  const stripped = String(b64 ?? '').trim().replace(/\s/g, '');
  const comma = stripped.indexOf(',');
  const data = stripped.startsWith('data:') && comma !== -1 ? stripped.slice(comma + 1) : stripped;
  const padded = data && data.length % 4 ? data + '='.repeat(4 - (data.length % 4)) : data;
  if (!padded || padded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) unreadable();
  const bytes = Buffer.from(padded, 'base64');
  if (!bytes.length) unreadable();
  return bytes;
}

export function extractMimoAudio(resp) {
  const choice = resp?.choices?.[0];
  if (choice?.finish_reason === 'content_filter') throw new ProjectError('MiMo blocked the text.');
  if (resp?.error) throw new ProjectError('MiMo could not make the voice. Check voice.id, voice.model and voice.host in video.json.');
  const audio = choice?.message?.audio?.data;
  if (!audio) throw new ProjectError('MiMo returned no audio.');
  return base64ToBytes(audio);
}

async function request(dir, host, body) {
  const key = apiKey(dir);
  const url = mimoEndpoint(host);
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(120000),
        headers: { 'api-key': key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ProjectError('MiMo did not answer. Check your connection and try again.');
    }
    const json = await res.json().catch(() => null);
    if (res.ok) return json ?? {};
    if (res.status === 401 || res.status === 403) {
      throw new ProjectError('MiMo rejected the API key. Set MIMO_TTS_API_KEY or put MIMO_TTS_API_KEY=... in a .env file in the project or explainroo folder.');
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) {
      await sleep(250 * 2 ** attempt);
      continue;
    }
    throw new ProjectError(res.status === 429 || res.status >= 500
      ? 'MiMo is busy. Try again in a moment.'
      : 'MiMo could not make the voice. Check voice.id, voice.model and voice.host in video.json.');
  }
}

function tempo(speed) {
  const filters = [];
  while (speed < 0.5) { filters.push('atempo=0.5'); speed /= 0.5; }
  while (speed > 2) { filters.push('atempo=2'); speed /= 2; }
  if (speed !== 1) filters.push(`atempo=${speed}`);
  return filters;
}

export async function decodeMp3(bytes, { speed = 1, build } = {}) {
  const root = build || os.tmpdir();
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'mimo-'));
  try {
    const mp3 = path.join(dir, 'in.mp3');
    const wav = path.join(dir, 'out.wav');
    fs.writeFileSync(mp3, Buffer.from(bytes));
    const filters = tempo(speed);
    await ffmpeg(['-loglevel', 'error', '-i', mp3, '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE),
      ...(filters.length ? ['-af', filters.join(',')] : []), '-c:a', 'pcm_s16le', wav]);
    const decoded = readWav(wav);
    return { audio: decoded.samples, sampling_rate: decoded.sampleRate };
  } catch (e) {
    if (e instanceof ProjectError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('could not start')) throw new ProjectError('ffmpeg could not start. Install ffmpeg or set EXPLAINROO_FFMPEG.');
    throw new ProjectError('MiMo returned unreadable audio. Try the voice command again.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function mimoSynthesize({ dir, text, voice, model, host, style, speed = 1, build } = {}) {
  const body = buildMimoBody(text, { voice, model, style });
  const json = await request(dir, host, body);
  return decodeMp3(extractMimoAudio(json), { speed, build });
}
