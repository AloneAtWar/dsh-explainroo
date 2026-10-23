import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaults } from '../src/config.ts';
import { engineModules, findEngine, sourceVoiceHash, upstreamModules } from '../src/host/engine.ts';
import { materializeCompatibility, completedVoices } from '../src/host/compatibility.ts';
import { previewData } from '../src/host/engine.ts';
import { encodeScript, parseScript } from '../src/host/compat/parser.mjs';
import { Projects } from '../src/host/projects.ts';
import { Tasks } from '../src/host/tasks.ts';
import { Workbench } from '../src/service.ts';

const engineRoot = findEngine(defaults());
describe('unchanged upstream with plugin compatibility projects', () => {
  let root: string; let folder: string; let projects: Projects; let app: Workbench | undefined;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-compat-')); folder = join(root, 'video'); await mkdir(folder);
    await writeFile(join(folder, 'video.json'), JSON.stringify({ language: 'en', cover: '开场@end', voice: { provider: 'mimo', id: '冰糖', style: '自然讲述' } }));
    await writeFile(join(folder, 'script.md'), '## 开场\n[#出现] Hello world.\n');
    await mkdir(join(folder, 'parts'));
    await writeFile(join(folder, 'scenes.js'), 'import {draw} from "./parts/draw.js";const scenes={开场(s){draw(s,"#出现")}};export default scenes;');
    await writeFile(join(folder, 'parts/draw.js'), 'export function draw(s,at){s.text("#出现",{id:"标题",at,color:"#abc"});s.mark("出现");}');
    projects = new Projects({ ...defaults(), engineRoot, libraryRoot: root, dataDir: join(root, 'settings') });
  });
  afterEach(async () => { vi.restoreAllMocks(); await app?.close(); app = undefined; await rm(root, { recursive: true, force: true }); });
  async function snapshot() { return materializeCompatibility(engineRoot, folder, join(root, 'snapshot'), (await projects.snapshot(folder)).studio); }
  async function cacheVoice() {
    const engine = await engineModules(engineRoot); const project = engine.loadProject(folder); const scene = project.script.scenes[0];
    await mkdir(join(folder, 'build/voice'), { recursive: true });
    engine.writeWav(join(folder, 'build/voice/开场.wav'), new Float32Array(24000).fill(0.1), 24000);
    const voice = { id: '开场', hash: sourceVoiceHash(engine, project, scene), duration: 1, marks: { 出现: 0.1 }, words: [{ text: 'Hello', spoken: 'Hello', start: 0.1, end: 0.4, matched: true }, { text: 'world.', spoken: 'world.', start: 0.4, end: 0.9, matched: true }], chunks: [{ start: 0, end: 1, text: 'Hello world.' }], matchRate: 1, transcript: 'Hello world.', unmatched: [] };
    await writeFile(join(folder, 'build/voice/开场.json'), JSON.stringify(voice)); return voice;
  }
  it('keeps upstream parser strict while the plugin preserves Unicode names and comments', async () => {
    const automatic = await new Projects({ ...projects.config, engineRoot: '' }).setup();
    expect(automatic.engineRoot).toBe(engineRoot); expect(automatic.configuredEngineRoot).toBe('');
    const upstream = await upstreamModules(engineRoot);
    expect(() => upstream.parseScript('## 开场\n[#出现] Hello.')).toThrow();
    const source = '# 标题 [#标题里的文字]\n<!--\n## 不应转换\n[#ignored!]\n-->## 开场\n> [#备注!]\n[#出现] {显示[#文字]|hello} world.\n';
    const converted = encodeScript(source);
    expect(converted.script).toContain('## 不应转换'); expect(converted.script).toContain('[#ignored!]');
    expect(converted.script).toContain('{显示[#文字]|hello}');
    expect(parseScript(source).scenes[0]).toMatchObject({ id: '开场', text: '显示[#文字] world.' });
    expect(encodeScript(source)).toEqual(converted);
  });
  it('converts imported timing references and cover without changing display text, colors or source files', async () => {
    const before = await readFile(join(folder, 'parts/draw.js'), 'utf8');
    const engineBytes = await readFile(join(engineRoot, 'src/script.js'));
    const manifest = await snapshot();
    const asciiScene = Object.keys(manifest.identities.scenes)[0];
    const asciiMark = Object.keys(manifest.identities.markers)[0];
    expect(asciiScene).toMatch(/^[A-Za-z0-9_-]+$/); expect(asciiScene).not.toBe('开场');
    const upstream = await upstreamModules(engineRoot); const copy = upstream.loadProject(join(root, 'snapshot'));
    expect(copy.script.scenes[0].id).toBe(asciiScene); expect(copy.config.cover).toBe(asciiScene + '@end');
    expect(copy.config.voice.provider).toBe('recording'); expect(manifest.voice.provider).toBe('mimo');
    const copied = await readFile(join(root, 'snapshot/parts/draw.js'), 'utf8');
    const drawing = await readFile(join(root, 'snapshot/studio-source.js'), 'utf8');
    expect(drawing).toContain('"#' + asciiMark + '"'); expect(copied).toContain('s.mark("' + asciiMark + '")');
    expect(copied).toContain('s.text("#出现"'); expect(copied).toContain('color:"#abc"');
    expect(await readFile(join(folder, 'parts/draw.js'), 'utf8')).toBe(before);
    expect(await readFile(join(engineRoot, 'src/script.js'))).toEqual(engineBytes);
  });
  it('rebases valid cached voices for upstream and reverses the mapping without generating speech', async () => {
    const voice = await cacheVoice(); const fetch = vi.spyOn(globalThis, 'fetch');
    const manifest = await snapshot(); expect(manifest.cached).toHaveLength(1);
    const engine = await upstreamModules(engineRoot); const copy = engine.loadProject(join(root, 'snapshot'));
    const voices = await engine.synthesize(copy);
    expect(voices[copy.script.scenes[0].id].duration).toBe(1);
    const files = await completedVoices(engineRoot, join(root, 'snapshot'));
    expect(JSON.parse(files['build/voice/开场.json'] as string)).toEqual(voice);
    expect(files['build/voice/开场.wav']).toEqual(await readFile(join(folder, 'build/voice/开场.wav')));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('runs explicit cached voice tasks through an owned worker and persists only original IDs', async () => {
    await cacheVoice(); const tasks = new Tasks(projects);
    try {
      const task = await tasks.start('video', 'voice'); const result = await tasks.wait(task.id);
      expect(result, result.log).toMatchObject({ status: 'completed', progress: 100 });
      expect((await projects.get('video')).allVoicesCached).toBe(true);
      const voice = JSON.parse(await readFile(join(folder, 'build/voice/开场.json'), 'utf8'));
      expect(voice.id).toBe('开场'); expect(voice.marks).toEqual({ 出现: 0.1 });
    } finally { await tasks.close(); }
  }, 15000);
  it('drops preview copies of a cache that was invalidated in the original project', async () => {
    await cacheVoice(); const manifest = await snapshot();
    const ascii = Object.keys(manifest.identities.scenes)[0];
    expect(existsSync(join(root, 'snapshot/build/voice', ascii + '.json'))).toBe(true);
    await rm(join(folder, 'build/voice/开场.wav')); await snapshot();
    expect(existsSync(join(root, 'snapshot/build/voice', ascii + '.json'))).toBe(false);
    expect((await previewData(engineRoot, join(root, 'snapshot'))).cached.size).toBe(0);
  });
  it('maps per-scene user recordings without modifying the original asset names', async () => {
    await cacheVoice(); await mkdir(join(folder, 'assets/narration'), { recursive: true });
    await writeFile(join(folder, 'assets/narration/开场.wav'), await readFile(join(folder, 'build/voice/开场.wav')));
    const config = JSON.parse(await readFile(join(folder, 'video.json'), 'utf8')); config.voice = { provider: 'recording', src: 'assets/narration/' };
    await writeFile(join(folder, 'video.json'), JSON.stringify(config)); await cacheVoice();
    const manifest = await snapshot(); const ascii = Object.keys(manifest.identities.scenes)[0];
    const upstream = await upstreamModules(engineRoot); const copy = upstream.loadProject(join(root, 'snapshot'));
    expect((await upstream.synthesize(copy))[ascii].duration).toBe(1);
    expect(existsSync(join(folder, 'assets/narration/开场.wav'))).toBe(true);
    expect(existsSync(join(root, 'snapshot/assets/narration', ascii + '.wav'))).toBe(true);
  });
  it('rejects stale cache publication after an external edit and preserves narration', async () => {
    await cacheVoice(); const initial = await projects.get('video'); await snapshot();
    const values = await completedVoices(engineRoot, join(root, 'snapshot'));
    const newer = '## 开场\n[#出现] A new narration.\n'; await writeFile(join(folder, 'script.md'), newer);
    expect(await projects.persistVoices('video', initial.revision, values)).toBe(false);
    expect(await readFile(join(folder, 'script.md'), 'utf8')).toBe(newer);
  });
  it('serves the compatibility preview with original workbench identities and disposes it', async () => {
    await mkdir(join(folder, 'assets')); await writeFile(join(folder, 'assets/old.png'), 'asset fixture');
    app = new Workbench(projects.config); await app.ready;
    const project = await app.invoke('project', { id: 'video' });
    expect(project.scenes[0].id).toBe('开场');
    const runtime = await readFile(join(engineRoot, 'engine/runtime.js'), 'utf8');
    expect(runtime).toContain('/__state.json');
    const state = await (await fetch(new URL('/__state.json', project.previewUrl))).json();
    expect(state.identities.scenes[state.timeline.scenes[0].id]).toBe('开场');
    expect(state.timeline.scenes[0].voice).toBeNull();
    expect((await fetch(new URL('/project/assets/old.png', project.previewUrl))).status).toBe(200);
    expect((await fetch(new URL('/project/scenes.js', project.previewUrl))).status).toBe(200);
    const drawing = await (await fetch(new URL('/project/studio-source.js', project.previewUrl))).text();
    expect(drawing).toContain('./parts/draw.js?dsh=');
    await writeFile(join(folder, 'parts/draw.js'), 'export function draw(s,at){s.text("Updated",{at});s.mark("出现")}');
    const updated = await (await fetch(new URL('/__state.json', project.previewUrl))).json();
    expect(updated.version).not.toBe(state.version);
    const latest = await (await fetch(new URL('/project/studio-source.js', project.previewUrl))).text();
    expect(latest).toContain('dsh=' + updated.version);
    await rm(join(folder, 'assets/old.png'));
    await fetch(new URL('/__state.json', project.previewUrl));
    expect((await fetch(new URL('/project/assets/old.png', project.previewUrl))).status).toBe(404);
    await app.close(); app = undefined;
    await expect(fetch(project.previewUrl)).rejects.toThrow();
    expect(existsSync(join(folder, 'build/voice'))).toBe(false);
  });
  it('fails closed for computed scene definitions and dangling markers before producing a snapshot', async () => {
    await writeFile(join(folder, 'scenes.js'), 'export default makeScenes()');
    await expect(snapshot()).rejects.toThrow('静态');
    await writeFile(join(folder, 'scenes.js'), 'export default {开场(s){s.text("Hello",{at:"#不存在"})}}');
    await expect(snapshot()).rejects.toThrow('不存在');
    expect(existsSync(join(root, 'snapshot/script.md'))).toBe(false);
  });
});
