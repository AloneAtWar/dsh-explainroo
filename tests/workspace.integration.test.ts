import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { defaults } from '../src/config.ts';
import { Workbench } from '../src/service.ts';
import { findEngine, upstreamModules } from '../src/host/engine.ts';

const engineRoot = findEngine(defaults());
describe.skipIf(!engineRoot)('empty video workspace onboarding', () => {
  let root: string; let folder: string; let app: Workbench;
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'explainroo-workspace-'))); folder = join(root, '我的视频'); await mkdir(folder);
    app = new Workbench({ ...defaults(), engineRoot, libraryRoot: join(root, 'not-selected'), dataDir: join(root, 'settings') }); await app.ready;
  });
  afterEach(async () => { vi.restoreAllMocks(); await app.close(); await rm(root, { recursive: true, force: true }); });
  const input = () => ({ folder: '', title: '从一个想法开始', theme: 'paper', size: 'vertical' });
  it('inspects an empty folder without creating files or changing the library', async () => {
    expect(await app.invoke('inspectFolder', { folder })).toMatchObject({ folder, kind: 'empty' });
    expect(await readdir(folder)).toEqual([]); expect((await app.invoke('setup', {})).projects).toEqual([]);
  });
  it('initializes a real zero-scene project with a usable workspace skill, without TTS or a preview server', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    const result = await app.invoke('createProject', { ...input(), folder });
    expect(result.project).toMatchObject({ id: basename(folder), title: input().title, width: 1080, height: 1920, sceneCount: 0, previewUrl: '', allVoicesCached: false, workspaceSkill: { installed: true, discoveryRoot: folder } });
    expect(result.setup.projects).toHaveLength(1); expect(await readdir(folder)).not.toContain('build'); expect(fetch).not.toHaveBeenCalled();
    const engine = await upstreamModules(engineRoot);
    expect(JSON.parse(await readFile(join(folder, 'video.json'), 'utf8'))).not.toHaveProperty('voice');
    expect(result.project.voiceSettings).toEqual({ provider: 'kokoro', id: engine.LANGUAGES.zh });
    expect(result.project.defaultVoice).toBe(engine.LANGUAGES.zh);
    const skillDir = join(folder, '.dsh/skills/explainroo');
    expect(await readFile(join(skillDir, 'references/scene-api.md'), 'utf8')).toContain('s.text');
    expect(await readFile(join(skillDir, 'examples/chinese-demo/scenes.js'), 'utf8')).toContain('export default');
    expect(await readFile(join(skillDir, 'references/upstream-guide.md'), 'utf8')).toEqual(await readFile(join(engineRoot, 'AGENTS.md'), 'utf8'));
    expect(await readdir(skillDir)).not.toContain('app');
    expect(await readFile(join(skillDir, 'references/storyboard-notes.md'), 'utf8')).toContain('explainroo_edit_scene');
    expect(JSON.parse(await readFile(join(skillDir, 'engine.json'), 'utf8')).engineRoot).toBe(engineRoot);
    const help = await promisify(execFile)(process.execPath, [join(skillDir, 'scripts/explainroo.mjs'), '--help'], { windowsHide: true });
    expect(help.stdout).toContain('explainroo');
    const reopened = new Workbench({ ...defaults(), engineRoot, dataDir: join(root, 'settings') });
    try { expect((await reopened.invoke('project', { id: basename(folder) })).workspaceSkill.installed).toBe(true); }
    finally { await reopened.close(); }
  });
  it('rejects occupied directories and invalid input while preserving their files and existing settings', async () => {
    await writeFile(join(folder, 'notes.txt'), '用户的资料');
    expect((await app.invoke('inspectFolder', { folder })).kind).toBe('occupied');
    await expect(app.invoke('createProject', { ...input(), folder })).rejects.toThrow('已有文件不会被覆盖');
    await expect(app.invoke('createProject', { ...input(), folder, title: '\n' })).rejects.toThrow();
    expect(await readdir(folder)).toEqual(['notes.txt']); expect(await readFile(join(folder, 'notes.txt'), 'utf8')).toBe('用户的资料');
    expect((await app.invoke('setup', {})).libraryRoot).toBe(join(root, 'not-selected'));
  });
  it('recovers a stale custom engine with the installed default and keeps that choice automatic', async () => {
    await app.close();
    await mkdir(join(root, 'settings'), { recursive: true });
    await writeFile(join(root, 'settings/settings.json'), JSON.stringify({ libraryRoot: folder, engineRoot: join(root, 'removed-engine') }));
    app = new Workbench({ ...defaults(), libraryRoot: folder, dataDir: join(root, 'settings') }); await app.ready;
    const broken = await app.invoke('setup', {});
    expect(broken).toMatchObject({ engineReady: false, engine: { source: 'custom', defaultReady: true } });
    const fetch = vi.spyOn(globalThis, 'fetch');
    const recovered = await app.invoke('configure', { engineRoot: '' });
    expect(recovered).toMatchObject({ engineReady: true, configuredEngineRoot: '', engine: { source: 'dependency' } });
    expect(recovered.pluginVersion).toBeTruthy();
    expect(JSON.parse(await readFile(join(root, 'settings/settings.json'), 'utf8')).engineRoot).toBe('');
    await app.invoke('configure', { libraryRoot: folder });
    expect(JSON.parse(await readFile(join(root, 'settings/settings.json'), 'utf8')).engineRoot).toBe('');
    expect(await readdir(folder)).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  });
  it('allows only one concurrent initialization and never replaces later creative work', async () => {
    const results = await Promise.allSettled([1, 2].map(() => app.invoke('createProject', { ...input(), folder })));
    expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    const script = '# 自己写的标题\n\n## intro\n[#idea] 自己的想法。\n';
    await writeFile(join(folder, 'script.md'), script);
    await expect(app.invoke('createProject', { ...input(), folder })).rejects.toThrow('已有文件不会被覆盖');
    expect(await readFile(join(folder, 'script.md'), 'utf8')).toBe(script);
  });
  it('creates and switches multiple projects while retaining the workspace root and shared skill', async () => {
    const first = await app.invoke('createProject', { ...input(), folder, directory: 'first' });
    expect(first.project.id).toBe('projects/first'); expect(first.setup.libraryRoot).toBe(folder);
    const original = await readFile(join(first.project.folder, 'video.json'), 'utf8');
    const second = await app.invoke('createProject', { ...input(), folder, directory: 'second', title: '第二个视频' });
    expect(second.setup.projects.map((item: any) => item.id)).toEqual(['projects/first', 'projects/second']);
    expect(second.setup.libraryRoot).toBe(folder); expect(second.project.title).toBe('第二个视频');
    expect((await app.invoke('project', { id: first.project.id })).folder).toBe(first.project.folder);
    expect(await readFile(join(first.project.folder, 'video.json'), 'utf8')).toBe(original);
    expect(await readFile(join(folder, '.dsh/skills/explainroo/SKILL.md'), 'utf8')).toContain('explainroo');
    await expect(app.invoke('createProject', { ...input(), folder, directory: 'first' })).rejects.toThrow('目录已存在');
    await expect(app.invoke('createProject', { ...input(), folder, directory: '../outside' })).rejects.toThrow();
    expect((await app.invoke('setup', {})).projects).toHaveLength(2);
  });
  it('retains a legacy project at the workspace root when adding a managed project', async () => {
    const legacy = await app.invoke('createProject', { ...input(), folder });
    const before = await readFile(join(folder, 'script.md'), 'utf8');
    const next = await app.invoke('createProject', { ...input(), folder, directory: 'next' });
    expect(next.setup.projects.map((item: any) => item.id)).toContain(legacy.project.id);
    expect(next.setup.projects.map((item: any) => item.id)).toContain('projects/next');
    expect(await readFile(join(folder, 'script.md'), 'utf8')).toBe(before);
    expect((await app.invoke('project', { id: legacy.project.id })).revision).toBe(legacy.project.revision);
  });
  it('saves validated voice settings without speech generation and preserves other project content', async () => {
    const { project } = await app.invoke('createProject', { ...input(), folder });
    const configFile = join(folder, 'video.json');
    const original = JSON.parse(await readFile(configFile, 'utf8'));
    const fetch = vi.spyOn(globalThis, 'fetch');
    const changed = await app.invoke('voiceSettings', { id: project.id, revision: project.revision, voice: { provider: 'elevenlabs', id: 'my-voice', model: 'eleven_multilingual_v2' } });
    expect(changed.voiceSettings).toMatchObject({ provider: 'elevenlabs', id: 'my-voice' });
    expect(changed.revision).not.toBe(project.revision);
    expect(JSON.parse(await readFile(configFile, 'utf8'))).toEqual({ ...original, voice: { provider: 'elevenlabs', id: 'my-voice', model: 'eleven_multilingual_v2' } });
    expect(changed.script).toBe(project.script); expect(changed.studio).toEqual(project.studio);
    expect(await app.invoke('tasks', { id: '*' })).toEqual([]); expect(fetch).not.toHaveBeenCalled();
    const kokoro = await app.invoke('voiceSettings', { id: project.id, revision: changed.revision, voice: { provider: 'kokoro', id: 'zf_xiaobei' } });
    expect(kokoro.voiceSettings).toEqual({ provider: 'kokoro', id: 'zf_xiaobei' });
    expect((await app.invoke('project', { id: project.id })).voiceSettings).toEqual(kokoro.voiceSettings);
    const recording = await app.invoke('voiceSettings', { id: project.id, revision: kokoro.revision, voice: { provider: 'recording', src: 'assets/旁白/' } });
    expect(recording.voiceSettings).toEqual({ provider: 'recording', src: 'assets/旁白/' });
    expect(recording.voice).toBe('recording · assets/旁白/');
    expect(JSON.parse(await readFile(configFile, 'utf8'))).toEqual({ ...original, voice: { provider: 'recording', src: 'assets/旁白/' } });
    expect(recording.script).toBe(project.script); expect(recording.studio).toEqual(project.studio);
    expect(await app.invoke('tasks', { id: '*' })).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { language: 'en', voice: undefined, expected: { provider: 'kokoro', id: 'af_heart' } },
    { language: 'ja', voice: undefined, expected: { provider: 'kokoro', id: 'jf_alpha' } },
    { language: 'zh', voice: 'zf_xiaoni', expected: { provider: 'kokoro', id: 'zf_xiaoni' } },
    { language: 'zh', voice: { provider: 'elevenlabs', id: 'project-voice', model: 'project-model' }, expected: { provider: 'elevenlabs', id: 'project-voice', model: 'project-model' } },
    { language: 'zh', voice: { provider: 'recording', src: 'assets/原始旁白/' }, expected: { provider: 'recording', src: 'assets/原始旁白/' } },
    { language: 'zh', voice: { provider: 'mimo', id: '原有音色', model: 'mimo-v2.5-tts', style: '自然讲述' }, expected: { provider: 'mimo', id: '原有音色', model: 'mimo-v2.5-tts', style: '自然讲述' } },
  ])('reads original $language voice $voice without rewriting the project or generating speech', async ({ language, voice, expected }) => {
    const source = JSON.stringify({ title: '原项目', language, ...(voice === undefined ? {} : { voice }) }, null, 4) + '\n';
    await writeFile(join(folder, 'video.json'), source);
    await writeFile(join(folder, 'script.md'), '# 原项目\n'); await writeFile(join(folder, 'scenes.js'), 'export default {};\n');
    const fetch = vi.spyOn(globalThis, 'fetch');
    await app.invoke('configure', { libraryRoot: folder });
    const project = await app.invoke('project', { id: basename(folder) });
    expect(project.voiceSettings).toMatchObject(expected);
    expect(project.defaultVoice).toBe((await upstreamModules(engineRoot)).LANGUAGES[language]);
    expect(await readFile(join(folder, 'video.json'), 'utf8')).toBe(source);
    expect(await readdir(folder)).not.toContain('build'); expect(fetch).not.toHaveBeenCalled();
    expect(await app.invoke('tasks', { id: '*' })).toEqual([]);
  });
  it('rejects stale, invalid, busy and unsupported voice changes without modifying the config', async () => {
    const { project } = await app.invoke('createProject', { ...input(), folder });
    const before = await readFile(join(folder, 'video.json'), 'utf8');
    const request = { id: project.id, revision: project.revision, voice: { provider: 'mimo', id: '冰糖' } };
    await expect(app.invoke('voiceSettings', { ...request, revision: 'stale' })).rejects.toThrow('项目已');
    await expect(app.invoke('voiceSettings', { ...request, voice: { provider: 'kokoro', id: 'af_heart' } })).rejects.toThrow();
    await expect(app.invoke('voiceSettings', { ...request, voice: { provider: 'mimo', id: '冰糖', apiKey: 'not-accepted' } })).rejects.toThrow();
    await expect(app.invoke('voiceSettings', { ...request, voice: { provider: 'mimo', id: '' } })).rejects.toThrow();
    await expect(app.invoke('voiceSettings', { ...request, voice: { provider: 'recording', src: 'assets/../outside.wav' } })).rejects.toThrow('voice.src');
    app.projects.isBusy = () => true;
    await expect(app.invoke('voiceSettings', request)).rejects.toThrow('正在执行任务');
    expect(await readFile(join(folder, 'video.json'), 'utf8')).toBe(before);
  });
  it('installs a skill in an existing project without changing its content or replacing a customized skill', async () => {
    await writeFile(join(folder, 'video.json'), JSON.stringify({ title: '已有作品', language: 'zh' }));
    await writeFile(join(folder, 'script.md'), '# 已有作品\n'); await writeFile(join(folder, 'scenes.js'), 'export default {};');
    await app.invoke('configure', { libraryRoot: folder });
    const before = await app.invoke('project', { id: basename(folder) });
    const installed = await app.invoke('installSkill', { id: before.id }); expect(installed.installed).toBe(true);
    expect((await app.invoke('project', { id: before.id })).revision).toBe(before.revision);
    await writeFile(installed.path, '我的自定义 skill');
    await app.invoke('installSkill', { id: before.id }); expect(await readFile(installed.path, 'utf8')).toBe('我的自定义 skill');
    const outside = join(root, 'outside'); await mkdir(outside);
    const another = join(root, 'linked'); await mkdir(another); await writeFile(join(another, 'video.json'), '{}'); await writeFile(join(another, 'script.md'), '# linked\n');
    await symlink(outside, join(another, '.dsh'), process.platform === 'win32' ? 'junction' : 'dir');
    await app.invoke('configure', { libraryRoot: another });
    await expect(app.invoke('installSkill', { id: 'linked' })).rejects.toThrow('包含链接'); expect(await readdir(outside)).toEqual([]);
  });
});
