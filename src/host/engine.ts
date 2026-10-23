import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Config } from '../config.ts';
import type { Appearance } from '../shared/types.ts';
import { parseScript } from './compat/parser.mjs';
import { loadProject, normalizeConfig } from './compat/config.mjs';
import * as references from './compat/references.mjs';
import upstream from '../../upstream.json';

export const upstreamCommit = upstream.commit;
const require = createRequire(import.meta.url);

export function findEngine(config: Config): string {
  const candidates = [config.engineRoot || process.env.EXPLAINROO_HOME || dirname(require.resolve('explainroo/package.json'))];
  for (const item of candidates) {
    if (!item) continue;
    for (const root of [resolve(item), resolve(item, 'app')]) {
      if (existsSync(join(root, 'src/project.js')) && existsSync(join(root, 'engine/runtime.js')) && existsSync(join(root, 'bin/explainroo.js'))) return root;
    }
  }
  return '';
}
const engines = new Map<string, Promise<Record<string, any>>>();
export async function upstreamModules(root: string): Promise<Record<string, any>> {
  if (!root) throw new Error('尚未找到 explainroo 引擎，请在设置中选择包含 src/、engine/ 和 bin/ 的目录。');
  let result = engines.get(root);
  if (!result) {
    result = (async () => {
      const names = ['project', 'script', 'timeline', 'voice', 'pipeline', 'server', 'fonts', 'models', 'env', 'render', 'recordings', 'wav', 'qa'];
      const modules = await Promise.all(names.map(name => import(pathToFileURL(join(root, `src/${name}.js`)).href)));
      const themes = await import(pathToFileURL(join(root, 'engine/themes.js')).href);
      return Object.assign({}, ...modules, themes);
    })();
    engines.set(root, result); result.catch(() => engines.delete(root));
  }
  return result;
}
export async function engineModules(root: string): Promise<Record<string, any>> {
  return { ...await upstreamModules(root), ...references, parseScript, loadProject, normalizeConfig };
}
export async function sourceRevision(folder: string): Promise<string> {
  const modules = (await readdir(folder)).filter(name => /\.(m?js|json)$/.test(name)).sort();
  const sources: Record<string, string> = Object.fromEntries(await Promise.all(modules.map(async name => [name, await readFile(join(folder, name), 'utf8')])));
  // Include imported submodules in optimistic revisions, too. Legacy projects
  // with module forms outside the static checker retain the previous behavior.
  try { Object.assign(sources, references.readProjectModules(folder)); } catch { /* surfaced by the plugin validator */ }
  return Object.keys(sources).sort().map(name => name + ':' + sources[name]).join('\n');
}
export function applyAppearance(config: any, appearance?: Appearance): any {
  const next = { ...config };
  if (!appearance) return next;
  if (appearance.theme) { next.theme = appearance.theme; next.look = null; }
  if (appearance.bg || appearance.background) {
    next.look = { ...(next.look ?? { extends: next.theme, name: 'studio-look' }),
      ...(appearance.bg ? { bg: appearance.bg } : {}), ...(appearance.background ? { background: appearance.background } : {}) };
  }
  if (appearance.captions !== undefined) next.captions = appearance.captions;
  return next;
}
export async function previewData(root: string, folder: string, appearance?: Appearance): Promise<{ project: any; timeline: any; cached: Set<string>; state: any }> {
  const engine = await engineModules(root);
  const project = engine.loadProject(folder);
  project.config = applyAppearance(project.config, appearance);
  const voices: Record<string, any> = {};
  const cached = new Set<string>();
  for (const scene of project.script.scenes) {
    const voice = engine.readVoice(project, scene.id);
    if (voice && voice.hash === sourceVoiceHash(engine, project, scene) && (!voice.duration || existsSync(join(folder, 'build/voice', `${scene.id}.wav`)))) {
      voices[scene.id] = voice; cached.add(scene.id); continue;
    }
    // A silent, estimated timeline makes storyboard preview possible before TTS.
    const words: Array<{ text: string; start: number; end: number }> = [];
    const unitTimes: Array<{ start: number; end: number } | null> = [];
    let time = 0;
    for (const unit of scene.units) {
      if (unit.type === 'word') {
        const duration = Math.max(0.12, [...unit.spoken].length / (project.config.language === 'zh' ? 4.5 : 13)) / project.config.pace;
        const word = { text: unit.display, start: time, end: time + duration };
        words.push(word); unitTimes.push(word); time += duration;
      } else { unitTimes.push(null); if (unit.type === 'pause') time += unit.sec; }
    }
    voices[scene.id] = { duration: time, words, marks: engine.resolveMarks(scene.units, unitTimes), chunks: [] };
  }
  const timeline = engine.buildTimeline(project, voices);
  for (const scene of timeline.scenes) if (!cached.has(scene.id)) scene.voice = null;
  return { project, timeline, cached, state: engine.makeState(project, timeline) };
}
export function voiceChunks(engine: Record<string, any>, scene: any, config: any): any[] {
  return engine.speechChunks(scene.units, { sentenceGap: config.sentenceGap, paragraphGap: config.paragraphGap, pace: config.pace, language: config.language });
}
export function sourceVoiceHash(engine: Record<string, any>, project: any, scene: any): string {
  let recording;
  if (project.config.voice.provider === 'recording') {
    const recordings = engine.recordingFiles({ ...project, script: { ...project.script, scenes: [scene] } });
    const file = recordings.files[scene.id];
    if (file) recording = { content: file.hash, scenes: recordings.folder ? null : project.script.scenes.map((item: any) => item.spoken) };
  }
  return engine.sceneHash(scene, voiceChunks(engine, scene, project.config), project.config, recording);
}
