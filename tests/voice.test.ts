import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaults } from '../src/config.ts';
import { findEngine, upstreamModules } from '../src/host/engine.ts';
import { materializeCompatibility } from '../src/host/compatibility.ts';
import { prepareExternalVoice } from '../src/host/voice.ts';
import { mimoSynthesize } from '../src/host/compat/mimo.mjs';

vi.mock('../src/host/compat/mimo.mjs', async importOriginal => ({ ...await importOriginal<object>(), mimoSynthesize: vi.fn() }));
describe('plugin MiMo audio feeds the original recording provider', () => {
  let root: string;
  afterEach(async () => { vi.clearAllMocks(); if (root) await rm(root, { recursive: true, force: true }); });
  it('keeps narration overrides, explicit pauses and tempo in generated external audio', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-voice-')); const folder = join(root, 'video'); await mkdir(folder);
    await writeFile(join(folder, 'video.json'), JSON.stringify({ language: 'en', speed: 1.2, pace: 1.3, voice: { provider: 'mimo', id: '冰糖', style: '自然' } }));
    await writeFile(join(folder, 'script.md'), '## 开场\n[#出现] {API|A P I} [pause 0.4] Hello.');
    await writeFile(join(folder, 'scenes.js'), 'export default {开场(s){s.text("API",{at:"#出现"})}}');
    const engineRoot = findEngine(defaults()); const destination = join(root, 'copy');
    const manifest = await materializeCompatibility(engineRoot, folder, destination, { version: 1, revision: 0, stage: 'audio', scenes: {} });
    vi.mocked(mimoSynthesize).mockResolvedValue({ audio: new Float32Array(2400).fill(0.2), sampling_rate: 24000 });
    await prepareExternalVoice(engineRoot, destination, folder, () => {});
    expect(mimoSynthesize).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mimoSynthesize).mock.calls[0][0]).toMatchObject({ text: 'A P I', speed: 1.56, voice: '冰糖', style: '自然', dir: folder });
    expect(vi.mocked(mimoSynthesize).mock.calls[1][0].text).toBe('Hello.');
    const engine = await upstreamModules(engineRoot); const copy = engine.loadProject(destination);
    expect(copy.config.voice.provider).toBe('recording'); expect(copy.config.speed * copy.config.pace).toBeCloseTo(1);
    const name = Object.keys(manifest.identities.scenes)[0];
    const audio = engine.readWav(join(destination, copy.config.voice.src, name + '.wav'));
    expect(audio.samples.length).toBe(4800 + Math.round(24000 * 0.4 / 1.3));
    expect(await readFile(join(folder, 'script.md'), 'utf8')).toContain('[#出现]');
  });
});
