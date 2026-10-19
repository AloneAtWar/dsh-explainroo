import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaults } from '../src/config.ts';
import { Projects } from '../src/host/projects.ts';
import { engineModules, findEngine, previewData } from '../src/host/engine.ts';
import { Tasks } from '../src/host/tasks.ts';

const engineRoot = findEngine(defaults());
describe.skipIf(!engineRoot)('real explainroo project persistence', () => {
  let root: string; let projects: Projects;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-explainroo-test-'));
    const folder = join(root, 'videos', 'demo'); await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'video.json'), JSON.stringify({ title: '测试项目', language: 'zh', voice: { provider: 'mimo', id: '冰糖' } }));
    await writeFile(join(folder, 'script.md'), '# 测试项目\n\n## intro {hold=1}\n[#a] 这是第一场。\n\n## second\n[#b] 这是第二场。\n');
    await writeFile(join(folder, 'scenes.js'), 'export default {intro(s){s.box("测试",{id:"box",x:960,y:540})},second(s){s.text("下一场")}};');
    projects = new Projects({ ...defaults(), libraryRoot: join(root, 'videos'), engineRoot, dataDir: join(root, 'state') });
    await projects.initialize();
  });
  afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
  it('builds an estimated, silent storyboard without calling a speech service', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const project = await projects.get('demo');
    expect(project.scenes).toHaveLength(2); expect(project.allVoicesCached).toBe(false); expect(project.duration).toBeGreaterThan(0);
    expect(project.scenes[0].marks.a).toBeGreaterThanOrEqual(0); expect(fetch).not.toHaveBeenCalled();
  });
  it('persists changes, rejects stale concurrent saves, and restores undo/redo after reopening', async () => {
    const original = await projects.get('demo');
    const saved = await projects.save({ id: 'demo', sceneId: 'intro', revision: original.revision, raw: '[#a] 保存的新旁白。' });
    await expect(projects.save({ id: 'demo', sceneId: 'intro', revision: original.revision, raw: '过时的输入' })).rejects.toThrow('其他窗口');
    const reopened = new Projects(projects.config);
    const undo = await reopened.history('demo', 'undo', saved.revision);
    expect(undo.scenes[0].raw).toEqual(original.scenes[0].raw);
    const redo = await reopened.history('demo', 'redo', undo.revision);
    expect(redo.scenes[0].raw).toBe('[#a] 保存的新旁白。');
    expect(redo.scenes[1].raw).toEqual(original.scenes[1].raw);
  });
  it('prevents AI edits and AI unlocking of a user-locked scene', async () => {
    const initial = await projects.get('demo');
    const locked = await projects.save({ id: 'demo', sceneId: 'intro', revision: initial.revision, locked: true });
    await expect(projects.save({ id: 'demo', sceneId: 'intro', revision: locked.revision, origin: 'ai', raw: 'AI 覆盖' })).rejects.toThrow('锁定');
    await expect(projects.save({ id: 'demo', sceneId: 'intro', revision: locked.revision, origin: 'ai', locked: false })).rejects.toThrow('锁定状态');
    expect((await projects.get('demo')).scenes[0].raw).toBe(initial.scenes[0].raw);
  });
  it('leaves both narration and history unchanged when script validation fails', async () => {
    const initial = await projects.get('demo');
    await expect(projects.save({ id: 'demo', sceneId: 'intro', revision: initial.revision, raw: '[#invalid!] 错误标记' })).rejects.toThrow();
    const next = await projects.get('demo'); expect(next.revision).toBe(initial.revision); expect(next.canUndo).toBe(false);
  });
  it('serializes simultaneous edits and rejects traversing outside the selected library', async () => {
    const initial = await projects.get('demo');
    const results = await Promise.allSettled(['甲', '乙'].map(note => projects.save({ id: 'demo', sceneId: 'intro', revision: initial.revision, note })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    await expect(projects.folder('../elsewhere')).rejects.toThrow('找不到项目');
  });
  it('persists appearance with undo and renders the same look without changing source config or narration', async () => {
    const original = await projects.get('demo');
    const sourceConfig = await readFile(join(original.folder, 'video.json'), 'utf8');
    const appearance = { theme: 'blueprint' as const, bg: '#172d44', background: 'plain' as const, captions: true };
    const next = await projects.mutate('demo', original.revision, snapshot => { snapshot.studio.appearance = appearance; });
    expect(next.appearance).toEqual({ ...appearance, custom: true });
    expect((await new Projects(projects.config).get('demo')).appearance).toEqual(next.appearance);
    const preview = await previewData(engineRoot, original.folder, appearance);
    const destination = await new Tasks(projects).createRenderSnapshot(original.folder, 'appearance-test');
    const engine = await engineModules(engineRoot);
    const exported = engine.loadProject(destination);
    expect(engine.getTheme(exported.config.theme, exported.config.look)).toEqual(engine.getTheme(preview.project.config.theme, preview.project.config.look));
    expect(exported.config.captions).toBe(true);
    expect(await readFile(join(original.folder, 'video.json'), 'utf8')).toBe(sourceConfig);
    expect(next.script).toBe(original.script);
    expect((await projects.history('demo', 'undo', next.revision)).appearance).toEqual(original.appearance);
  });
  it('opens a zero-scene project without a renderer or TTS, preserves its draft, and rejects generation', async () => {
    const folder = await projects.folder('demo');
    const draft = '# 等待创作\n\n这里是还没拆成场景的想法。\n';
    await writeFile(join(folder, 'script.md'), draft);
    const preview = vi.fn(async () => 'http://unexpected-preview/'); projects.previewUrl = preview;
    const fetch = vi.spyOn(globalThis, 'fetch');
    const empty = await projects.get('demo');
    expect(empty.scenes).toEqual([]); expect(empty.duration).toBe(0); expect(empty.previewUrl).toBe(''); expect(empty.allVoicesCached).toBe(false);
    expect(preview).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    const styled = await projects.mutate('demo', empty.revision, snapshot => { snapshot.studio.appearance = { theme: 'midnight' }; });
    expect(styled.script).toBe(draft); expect(styled.appearance.theme).toBe('midnight');
    await expect(new Tasks(projects).start('demo', 'voice')).rejects.toThrow('至少一个场景');
  });
});
