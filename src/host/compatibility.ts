import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, realpath, lstat, writeFile, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { applyAppearance, engineModules, upstreamModules, sourceVoiceHash, voiceChunks } from './engine.ts';
import { encodeScript } from './compat/parser.mjs';
import { compatibleSources, readProjectModules } from './compat/references.mjs';
import { readOptional } from './files.ts';
import { runtimeAsset } from './preview.ts';
import type { StudioState } from '../shared/types.ts';
import type { Identities } from '../shared/identities.ts';

export interface CompatibilityManifest {
  version: 1; identities: Identities; voice: any; tempo: number;
  hashes: Record<string, string>; cached: string[];
}
export const compatibilityFile = '.explainroo/compatibility.json';

export async function writeChanged(file: string, value: string | Uint8Array): Promise<void> {
  const bytes = Buffer.from(value);
  try { if ((await readFile(file)).equals(bytes)) return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await mkdir(dirname(file), { recursive: true }); await writeFile(file, bytes);
}
export async function copyProjectTree(source: string, target: string, projectRoot: string): Promise<void> {
  if (!existsSync(source)) {
    if (existsSync(target)) for (const name of await readdir(target)) if (name !== '.dsh-narration') await rm(join(target, name), { recursive: true, force: true });
    return;
  }
  const root = await realpath(projectRoot);
  async function copy(file: string, destination: string, ancestors: Set<string>): Promise<void> {
    const real = await realpath(file); const rel = relative(root, real);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('项目素材或录音链接超出项目目录。');
    const stat = await lstat(real);
    if (stat.isDirectory()) {
      if (ancestors.has(real)) throw new Error('项目素材包含循环链接。');
      const next = new Set(ancestors); next.add(real);
      await mkdir(destination, { recursive: true });
      if ((await lstat(destination)).isSymbolicLink()) throw new Error('兼容副本目录不能是链接。');
      const entries = await readdir(real);
      for (const entry of await readdir(destination)) if (!entries.includes(entry) && entry !== '.dsh-narration') await rm(join(destination, entry), { recursive: true, force: true });
      for (const entry of entries) await copy(join(real, entry), join(destination, entry), next);
    } else if (stat.isFile()) await writeChanged(destination, await readFile(real));
  }
  await copy(source, target, new Set());
}

export function mapVoice(info: any, id: string, identities: Identities, encode: boolean): any {
  const markers = encode ? Object.fromEntries(Object.entries(identities.markers).map(([ascii, original]) => [original, ascii])) : identities.markers;
  return { ...info, id, marks: Object.fromEntries(Object.entries(info.marks ?? {}).map(([name, time]) => [markers[name] ?? name, time])) };
}

/** Materializes only project inputs. It never writes to the engine or calls TTS. */
export async function materializeCompatibility(root: string, folder: string, destination: string, studio: StudioState): Promise<CompatibilityManifest> {
  if (resolve(folder) === resolve(destination)) throw new Error('兼容副本不能覆盖原项目。');
  const engine = await engineModules(root); const upstream = await upstreamModules(root);
  const source = await readFile(join(folder, 'script.md'), 'utf8');
  const raw = JSON.parse(await readFile(join(folder, 'video.json'), 'utf8'));
  const original = engine.loadProject(folder);
  const { script, identities } = encodeScript(source);
  const modules = compatibleSources(source, readProjectModules(folder), identities, { language: original.config.language, config: raw, studio });
  await mkdir(destination, { recursive: true });
  for (const [name, contents] of Object.entries(modules)) await writeChanged(join(destination, name === 'scenes.js' ? 'studio-source.js' : name), contents);
  for (const name of await readdir(folder)) if (/\.json$/i.test(name) && !name.startsWith('.') && name !== 'video.json') await writeChanged(join(destination, name), await readFile(join(folder, name)));
  await copyProjectTree(join(folder, 'assets'), join(destination, 'assets'), folder);
  const config = applyAppearance(original.config, studio.appearance);
  if (config.look) {
    await writeChanged(join(destination, 'studio-look.json'), JSON.stringify(config.look)); raw.theme = 'studio-look.json';
  } else if (studio.appearance?.theme) raw.theme = config.theme;
  if (studio.appearance?.captions !== undefined) raw.captions = studio.appearance.captions;
  const scenes = Object.fromEntries(Object.entries(identities.scenes).map(([ascii, name]) => [name, ascii]));
  if (typeof raw.cover === 'string' && scenes[raw.cover.split('@')[0]]) { const [name, ...tail] = raw.cover.split('@'); raw.cover = [scenes[name], ...tail].join('@'); }
  const mimo = original.config.voice.provider === 'mimo';
  if (mimo) {
    raw.voice = { provider: 'recording', src: 'assets/.dsh-narration/' };
    // MiMo chunks already include the requested tempo and scripted pauses.
    raw.speed = 1 / original.config.pace;
    await mkdir(join(destination, raw.voice.src), { recursive: true });
  } else if (original.config.voice.provider === 'recording') {
    const recordings = upstream.recordingFiles(original);
    if (recordings.folder) for (const [name, entry] of Object.entries(recordings.files) as Array<[string, any]>) {
      const extension = entry.file.slice(entry.file.lastIndexOf('.'));
      await writeChanged(join(destination, original.config.voice.src, scenes[name] + extension), await readFile(entry.file));
    }
  }
  await writeChanged(join(destination, 'script.md'), script);
  await writeChanged(join(destination, 'video.json'), JSON.stringify(raw, null, 2));
  await writeChanged(join(destination, 'studio-adapter.js'), await readFile(runtimeAsset('scene-adapter.js')));
  await writeChanged(join(destination, 'scenes.js'), `import source from './studio-source.js';\nimport {wrapScenes} from './studio-adapter.js';\nconst state=${JSON.stringify(studio)};\nconst identities=${JSON.stringify(identities)};\nexport default wrapScenes(source,()=>globalThis.__explainrooStudio?.state??state,(id,items)=>globalThis.__explainrooStudio?.report(id,items),()=>identities);\n`);
  const compatible = upstream.loadProject(destination);
  const manifest: CompatibilityManifest = { version: 1, identities, voice: original.config.voice, tempo: original.config.speed * original.config.pace, hashes: {}, cached: [] };
  for (const scene of original.script.scenes) {
    const ascii = scenes[scene.id];
    const hash = sourceVoiceHash(engine, original, scene); manifest.hashes[scene.id] = hash;
    const info = engine.readVoice(original, scene.id);
    if (info?.hash !== hash || info.duration && !existsSync(join(folder, 'build/voice', scene.id + '.wav'))) {
      for (const extension of ['json', 'wav']) await rm(join(destination, 'build/voice', ascii + '.' + extension), { force: true });
      continue;
    }
    const voice = mapVoice(info, ascii, identities, true);
    if (existsSync(join(folder, 'build/voice', scene.id + '.wav'))) {
      const wav = await readFile(join(folder, 'build/voice', scene.id + '.wav'));
      await writeChanged(join(destination, 'build/voice', ascii + '.wav'), wav);
      if (mimo) await writeChanged(join(destination, raw.voice.src, ascii + '.wav'), wav);
    }
    const compatibleScene = compatible.script.scenes.find((item: any) => item.id === ascii);
    if (mimo && compatibleScene.units.some((unit: any) => unit.type === 'word')) {
      const wav = await readFile(join(destination, raw.voice.src, ascii + '.wav'));
      voice.hash = upstream.sceneHash(compatibleScene, voiceChunks(upstream, compatibleScene, compatible.config), compatible.config, { content: createHash('sha256').update(wav).digest('hex'), scenes: null });
    } else voice.hash = sourceVoiceHash(upstream, compatible, compatibleScene);
    await writeChanged(join(destination, 'build/voice', ascii + '.json'), JSON.stringify(voice));
    manifest.cached.push(ascii);
  }
  await writeChanged(join(destination, compatibilityFile), JSON.stringify(manifest));
  return manifest;
}

/** Collect successful voices for a revision-checked transaction in the source. */
export async function completedVoices(root: string, destination: string): Promise<Record<string, string | Buffer>> {
  const manifest = JSON.parse(await readFile(join(destination, compatibilityFile), 'utf8')) as CompatibilityManifest;
  const upstream = await upstreamModules(root); const project = upstream.loadProject(destination);
  const result: Record<string, string | Buffer> = {};
  for (const scene of project.script.scenes) {
    const info = upstream.readVoice(project, scene.id);
    if (!info || info.hash !== sourceVoiceHash(upstream, project, scene)) continue;
    const original = manifest.identities.scenes[scene.id];
    if (!original || !manifest.hashes[original]) continue;
    const voice = { ...mapVoice(info, original, manifest.identities, false), hash: manifest.hashes[original] };
    const file = join(destination, 'build/voice', scene.id + '.wav');
    if (info.duration && !existsSync(file)) continue;
    if (existsSync(file)) result[`build/voice/${original}.wav`] = await readFile(file);
    result[`build/voice/${original}.json`] = JSON.stringify(voice, null, 2);
  }
  return result;
}

export async function previewFingerprint(folder: string): Promise<string> {
  const values: string[] = [];
  async function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const name of await readdir(dir)) {
      const file = join(dir, name); const stat = await lstat(file);
      if (stat.isDirectory()) await walk(file);
      else values.push(`${relative(folder, file)}:${stat.size}:${stat.mtimeMs}`);
    }
  }
  await walk(join(folder, 'assets')); await walk(join(folder, 'build/voice'));
  return values.sort().join('\n');
}

export async function readCompatibility(folder: string): Promise<CompatibilityManifest | null> {
  const source = await readOptional(join(resolve(folder), compatibilityFile)); return source ? JSON.parse(source) : null;
}
