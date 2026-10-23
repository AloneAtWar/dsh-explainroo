import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { upstreamModules, voiceChunks } from './engine.ts';
import { readCompatibility } from './compatibility.ts';
import { mimoSynthesize } from './compat/mimo.mjs';

/** Runs only inside an explicitly requested voice/render task's owned worker. */
export async function prepareExternalVoice(root: string, folder: string, original: string, log: (line: string) => void): Promise<void> {
  const manifest = await readCompatibility(folder);
  if (manifest?.voice.provider !== 'mimo') return;
  const engine = await upstreamModules(root); const project = engine.loadProject(folder);
  const target = join(folder, project.config.voice.src); await mkdir(target, { recursive: true });
  const voice = manifest.voice;
  for (const scene of project.script.scenes) {
    if (manifest.cached.includes(scene.id)) continue;
    const chunks = voiceChunks(engine, scene, project.config);
    if (!chunks.length) continue;
    const pieces: Float32Array[] = [];
    for (const chunk of chunks) {
      if (chunk.gapBefore) pieces.push(new Float32Array(Math.round(chunk.gapBefore * 24000)));
      const audio = await mimoSynthesize({ dir: original, text: chunk.text, voice: voice.id, model: voice.model, host: voice.host, style: voice.style, speed: manifest.tempo, build: join(folder, 'build') });
      pieces.push(engine.trimSilence(audio.audio, audio.sampling_rate));
    }
    const samples = new Float32Array(pieces.reduce((length, piece) => length + piece.length, 0));
    let cursor = 0; for (const piece of pieces) { samples.set(piece, cursor); cursor += piece.length; }
    const file = join(target, scene.id + '.wav'); engine.writeWav(file, samples, 24000);
    log(`MiMo ${manifest.identities.scenes[scene.id] ?? scene.id}: 已生成外部音频`);
    // The original engine consumes this file through its recording provider.
    // It owns normalization, word alignment, captions and scene timing.
  }
}
