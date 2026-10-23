import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, isAbsolute, join, relative } from 'node:path';
import { z } from 'zod';
import type { Config } from '../config.ts';
import { studioSchema, type EditRequest, type NewProjectRequest, type ProjectDetail, type ProjectSummary, type SetupInfo, type StudioState, type RenameRequest, type ValidationReport } from '../shared/types.ts';
import { atomicWrite, digest, readOptional, Serial } from './files.ts';
import { applyAppearance, engineModules, findEngine, previewData, sourceRevision } from './engine.ts';
import { replaceScene, sections } from './script.ts';
import { createWorkspace, createWorkspaceProject, inspectFolder, installWorkspaceSkill, workspaceSkill } from './workspace.ts';
import { voiceSettingsSchema, type VoiceSettings } from '../shared/types.ts';
import { stableProject, writeProjectTransaction } from './transaction.ts';

const emptyStudio = (): StudioState => ({ version: 1, revision: 0, stage: 'storyboard', scenes: {} });
interface VoiceSnapshot { json: string; wavHash: string | null }
interface Snapshot { script: string; studio: StudioState; files?: Record<string, string>; guards?: Record<string, string>; voices?: Record<string, VoiceSnapshot> }
const snapshotSchema = z.object({ script: z.string(), studio: studioSchema, files: z.record(z.string(), z.string()).optional(), guards: z.record(z.string(), z.string()).optional(), voices: z.record(z.string(), z.object({ json: z.string(), wavHash: z.string().nullable() })).optional() });
const historySchema = z.object({ undo: z.array(snapshotSchema).max(30), redo: z.array(snapshotSchema).max(30) });
export class Projects {
  readonly serial = new Serial();
  previewUrl: (id: string) => Promise<string> = async () => '';
  isBusy: (id: string) => boolean = () => false;
  constructor(public config: Config) {}
  async initialize(): Promise<void> {
    const saved = await readOptional(join(this.config.dataDir, 'settings.json'));
    if (saved) Object.assign(this.config, z.object({ libraryRoot: z.string(), engineRoot: z.string() }).parse(JSON.parse(saved)));
  }
  engineRoot(): string { return findEngine(this.config); }
  async configure(request: { libraryRoot?: string; engineRoot?: string }): Promise<SetupInfo> {
    const next = { ...this.config };
    if (request.libraryRoot !== undefined) {
      if (!isAbsolute(request.libraryRoot)) throw new Error('请选择绝对路径。');
      next.libraryRoot = (await inspectFolder(request.libraryRoot)).folder;
    }
    if (request.engineRoot !== undefined) {
      if (request.engineRoot && !isAbsolute(request.engineRoot)) throw new Error('引擎目录必须是绝对路径。');
      next.engineRoot = request.engineRoot;
      if (!findEngine(next)) throw new Error('该目录不包含 explainroo 引擎。');
    }
    const setup = await new Projects(next).setup();
    await atomicWrite(join(next.dataDir, 'settings.json'), JSON.stringify({ libraryRoot: next.libraryRoot, engineRoot: next.engineRoot }, null, 2));
    Object.assign(this.config, next);
    return setup;
  }
  async createProject(request: NewProjectRequest): Promise<{ setup: SetupInfo; project: ProjectDetail }> {
    await engineModules(this.engineRoot());
    const folder = request.directory ? await createWorkspaceProject(request, this.engineRoot()) : await createWorkspace(request, this.engineRoot());
    const setup = await this.configure({ libraryRoot: request.directory ? request.folder : folder });
    const selected = setup.projects.find(item => item.folder === folder);
    if (!selected) throw new Error('初始化完成，但未能在工作台中找到项目。请刷新。');
    return { setup, project: await this.get(selected.id) };
  }
  async installSkill(id: string) {
    await engineModules(this.engineRoot());
    return installWorkspaceSkill(await this.folder(id), this.engineRoot());
  }
  async folders(): Promise<Array<{ id: string; folder: string }>> {
    const root = this.config.libraryRoot;
    if (!existsSync(root)) return [];
    const resolvedRoot = await realpath(root);
    const result: Array<{ id: string; folder: string }> = [];
    if (existsSync(join(root, 'video.json')) && existsSync(join(root, 'script.md'))) result.push({ id: basename(root), folder: resolvedRoot });
    const scan = async (dir: string, prefix = '') => {
      if (!existsSync(dir)) return;
      const realDir = await realpath(dir); const containerRel = relative(resolvedRoot, realDir);
      if (containerRel.startsWith('..') || isAbsolute(containerRel)) return;
      for (const item of await readdir(dir, { withFileTypes: true })) {
        if (!item.isDirectory() || item.name.startsWith('.') || !existsSync(join(dir, item.name, 'video.json')) || !existsSync(join(dir, item.name, 'script.md'))) continue;
        const folder = await realpath(join(dir, item.name)); const rel = relative(resolvedRoot, folder);
        if (rel.startsWith('..') || isAbsolute(rel)) continue;
        result.push({ id: prefix + item.name, folder });
      }
    };
    await scan(root); await scan(join(root, 'projects'), 'projects/');
    return result;
  }
  async folder(id: string): Promise<string> {
    const entry = (await this.folders()).find(item => item.id === id);
    if (!entry) throw new Error(`找不到项目：${id}`);
    return entry.folder;
  }
  async list(): Promise<ProjectSummary[]> {
    return Promise.all((await this.folders()).map(async ({ id, folder }) => {
      const config = JSON.parse(await readFile(join(folder, 'video.json'), 'utf8'));
      const script = await readFile(join(folder, 'script.md'), 'utf8');
      const rawTimeline = await readOptional(join(folder, 'build/timeline.json'));
      return { id, title: String(config.title ?? id), folder, sceneCount: sections(script).length, duration: rawTimeline ? Number(JSON.parse(rawTimeline).duration ?? 0) : 0, hasVideo: existsSync(join(folder, 'out/video.mp4')) || existsSync(join(folder, 'out/video-studio.mp4')) };
    }));
  }
  async setup(): Promise<SetupInfo> {
    const engineRoot = this.engineRoot();
    const folderState = existsSync(this.config.libraryRoot) ? await inspectFolder(this.config.libraryRoot) : undefined;
    return { engineRoot, configuredEngineRoot: this.config.engineRoot, engineReady: !!engineRoot, libraryRoot: this.config.libraryRoot, projects: await this.list(), missing: engineRoot ? [] : ['explainroo 引擎'], ...(folderState ? { folderState } : {}) };
  }
  async snapshot(folder: string): Promise<Snapshot> {
    await stableProject(folder);
    const script = await readFile(join(folder, 'script.md'), 'utf8');
    const rawState = await readOptional(join(folder, '.explainroo/studio.json'));
    return { script, studio: rawState ? studioSchema.parse(JSON.parse(rawState)) : emptyStudio() };
  }
  async revision(folder: string, snapshot: Snapshot): Promise<string> {
    return digest(folder + '\0' + snapshot.script + JSON.stringify(snapshot.studio) + await sourceRevision(folder));
  }
  async get(id: string): Promise<ProjectDetail> {
    const folder = await this.folder(id);
    const snapshot = await this.snapshot(folder);
    const rawSections = sections(snapshot.script);
    const engine = await engineModules(this.engineRoot());
    const data = rawSections.length ? await previewData(this.engineRoot(), folder, snapshot.studio.appearance) : {
      project: { config: applyAppearance(engine.normalizeConfig(JSON.parse(await readFile(join(folder, 'video.json'), 'utf8')), folder), snapshot.studio.appearance), script: { title: '' } },
      timeline: { scenes: [], duration: 0 }, cached: new Set<string>(),
    };
    const { project, timeline, cached } = data;
    const look = engine.getTheme(project.config.theme, project.config.look);
    const history = await this.readHistory(folder);
    return {
      id, title: project.config.title ?? project.script.title ?? id, folder, sceneCount: timeline.scenes.length, duration: timeline.duration,
      hasVideo: existsSync(join(folder, 'out/video.mp4')) || existsSync(join(folder, 'out/video-studio.mp4')),
      revision: await this.revision(folder, snapshot), script: snapshot.script, studio: snapshot.studio,
      workspaceSkill: await workspaceSkill(folder),
      width: project.config.width, height: project.config.height, fps: project.config.fps, theme: project.config.theme,
      appearance: { theme: project.config.look?.extends ?? project.config.theme, bg: look.bg, background: look.background, captions: project.config.captions, custom: !!Object.keys(snapshot.studio.appearance ?? {}).length },
      voice: typeof project.config.voice === 'string' ? project.config.voice : `${project.config.voice.provider} · ${project.config.voice.provider === 'recording' ? project.config.voice.src : project.config.voice.id}`,
      voiceSettings: typeof project.config.voice === 'string' ? { provider: 'kokoro', id: project.config.voice } : project.config.voice,
      defaultVoice: engine.LANGUAGES[project.config.language],
      language: project.config.language,
      voiceChoices: Object.entries(engine.VOICES).filter(([id]) => engine.voiceLanguage(id) === project.config.language).map(([id, label]) => ({ id, label: String(label) })),
      scenes: timeline.scenes.map((scene: any) => ({ id: scene.id, index: scene.index, text: scene.text, raw: rawSections.find(item => item.id === scene.id)?.raw ?? '', start: scene.start, duration: scene.dur, marks: scene.marks, cached: cached.has(scene.id) })),
      previewUrl: rawSections.length ? await this.previewUrl(id) : '', allVoicesCached: timeline.scenes.length > 0 && cached.size === timeline.scenes.length,
      canUndo: history.undo.length > 0, canRedo: history.redo.length > 0,
    } as ProjectDetail;
  }
  private async readHistory(folder: string) {
    const raw = await readOptional(join(folder, '.explainroo/history.json'));
    return raw ? historySchema.parse(JSON.parse(raw)) : { undo: [] as Snapshot[], redo: [] as Snapshot[] };
  }
  private async wavHash(folder: string, name: string): Promise<string | null> {
    try { return createHash('sha256').update(await readFile(join(folder, 'build/voice', `${name}.wav`))).digest('hex'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
  }
  private async captureVoices(folder: string, names: string[]): Promise<Record<string, VoiceSnapshot>> {
    const result: Record<string, VoiceSnapshot> = {};
    for (const name of names) {
      if (!/^[\p{L}\p{M}\p{N}_-]+$/u.test(name)) throw new Error('配音名称无效。');
      const json = await readOptional(join(folder, 'build/voice', `${name}.json`));
      if (json) result[name] = { json, wavHash: await this.wavHash(folder, name) };
    }
    return result;
  }
  private async writeSnapshot(folder: string, next: Snapshot, previous: Snapshot, history: unknown, audio: Record<string, Buffer> = {}): Promise<void> {
    const engine = await engineModules(this.engineRoot());
    if (sections(next.script).length) engine.parseScript(next.script, { language: JSON.parse(await readFile(join(folder, 'video.json'), 'utf8')).language ?? 'en' });
    const values: Record<string, string | Buffer> = { ...next.files, 'script.md': next.script, '.explainroo/studio.json': JSON.stringify(next.studio, null, 2), '.explainroo/history.json': JSON.stringify(history), ...audio };
    for (const [name, voice] of Object.entries(next.voices ?? {})) {
      if (!/^[\p{L}\p{M}\p{N}_-]+$/u.test(name)) throw new Error('配音名称无效。');
      const copied = audio[`build/voice/${name}.wav`];
      const currentHash = copied ? createHash('sha256').update(copied).digest('hex') : await this.wavHash(folder, name);
      // A later render may have replaced the WAV. Never attach old word times
      // to new audio when undoing a rename.
      if (currentHash === voice.wavHash) values[`build/voice/${name}.json`] = voice.json;
    }
    const rawStudio = await readOptional(join(folder, '.explainroo/studio.json'));
    if (JSON.stringify(rawStudio ? studioSchema.parse(JSON.parse(rawStudio)) : emptyStudio()) !== JSON.stringify(previous.studio)) throw new Error('画面状态已被其他窗口或 AI 修改，请刷新后重试。');
    await writeProjectTransaction(folder, values, { 'script.md': previous.script, '.explainroo/studio.json': rawStudio, ...next.guards });
  }
  private assertIdle(id: string): void { if (this.isBusy(id)) throw new Error('项目正在执行任务，请等待完成或先取消任务。'); }
  async setVoice(request: { id: string; revision: string; voice: VoiceSettings }): Promise<ProjectDetail> {
    const voice = voiceSettingsSchema.parse(request.voice);
    return this.serial.run(request.id, async () => {
      this.assertIdle(request.id);
      const folder = await this.folder(request.id);
      if (await this.revision(folder, await this.snapshot(folder)) !== request.revision) throw new Error('项目已被其他窗口或 AI 修改。请刷新后再保存；当前输入会保留。');
      const file = join(folder, 'video.json'); const previous = await readFile(file, 'utf8');
      const next = { ...JSON.parse(previous), voice };
      const engine = await engineModules(this.engineRoot());
      engine.normalizeConfig(next, folder);
      if (await this.revision(folder, await this.snapshot(folder)) !== request.revision) throw new Error('项目已被其他窗口或 AI 修改。请刷新后再保存；当前输入会保留。');
      const serialized = JSON.stringify(next, null, 2) + '\n';
      await atomicWrite(file, serialized);
      try { return await this.get(request.id); }
      catch (error) { if (await readFile(file, 'utf8') === serialized) await atomicWrite(file, previous); throw error; }
    });
  }
  async mutate(id: string, revision: string, edit: (snapshot: Snapshot) => void): Promise<ProjectDetail> {
    return this.serial.run(id, async () => {
      this.assertIdle(id);
      const folder = await this.folder(id);
      const previous = await this.snapshot(folder);
      if (await this.revision(folder, previous) !== revision) throw new Error('项目已被其他窗口或 AI 修改。请刷新后再保存；当前输入会保留。');
      const next = structuredClone(previous);
      edit(next); next.studio.revision += 1;
      studioSchema.parse(next.studio);
      const engine = await engineModules(this.engineRoot());
      if (sections(next.script).length) engine.parseScript(next.script, { language: JSON.parse(await readFile(join(folder, 'video.json'), 'utf8')).language ?? 'en' });
      const history = await this.readHistory(folder);
      await mkdir(join(folder, '.explainroo'), { recursive: true });
      await this.writeSnapshot(folder, next, previous, { undo: [...history.undo, previous].slice(-30), redo: [] });
      return this.get(id);
    });
  }
  async save(request: EditRequest): Promise<ProjectDetail> {
    return this.mutate(request.id, request.revision, snapshot => {
      if (!sections(snapshot.script).some(item => item.id === request.sceneId)) throw new Error('场景不存在。');
      const edit = snapshot.studio.scenes[request.sceneId] ??= { locked: false, note: '', elements: {} };
      if (edit.locked && (request.raw !== undefined || request.note !== undefined || request.element !== undefined)) throw new Error('该场景已锁定，请先手动解锁。');
      if (request.origin === 'ai' && request.locked !== undefined) throw new Error('AI 不能更改用户的锁定状态。');
      if (request.raw !== undefined) snapshot.script = replaceScene(snapshot.script, request.sceneId, request.raw);
      if (request.note !== undefined) edit.note = request.note;
      if (request.locked !== undefined) edit.locked = request.locked;
      if (request.elementId && request.element) edit.elements[request.elementId] = request.element;
    });
  }
  async validate(id: string): Promise<ValidationReport> {
    const folder = await this.folder(id); await stableProject(folder);
    const engine = await engineModules(this.engineRoot());
    return engine.validateProjectReferences(folder);
  }
  async persistVoices(id: string, revision: string, values: Record<string, string | Buffer>): Promise<boolean> {
    return this.serial.run(id, async () => {
      const folder = await this.folder(id); const snapshot = await this.snapshot(folder);
      if (await this.revision(folder, snapshot) !== revision) return false;
      const engine = await engineModules(this.engineRoot());
      const guards: Record<string, string> = { ...engine.readProjectModules(folder), 'script.md': snapshot.script, 'video.json': await readFile(join(folder, 'video.json'), 'utf8') };
      await writeProjectTransaction(folder, { ...guards, ...values }, guards);
      return true;
    });
  }
  async rename(request: RenameRequest): Promise<ProjectDetail> {
    return this.serial.run(request.id, async () => {
      this.assertIdle(request.id);
      const folder = await this.folder(request.id); const previous = await this.snapshot(folder);
      if (await this.revision(folder, previous) !== request.revision) throw new Error('项目已被其他窗口或 AI 修改。请刷新后再改名。');
      const engine = await engineModules(this.engineRoot());
      const target = previous.studio.scenes[request.sceneId];
      if (target?.locked) throw new Error('该场景已锁定，请先手动解锁。');
      const configSource = await readFile(join(folder, 'video.json'), 'utf8'); const config = JSON.parse(configSource);
      const sources = engine.readProjectModules(folder) as Record<string, string>;
      const result = engine.renameReferences(previous.script, sources, request, { language: config.language ?? 'en', config, studio: previous.studio });
      if (request.to === (request.kind === 'scene' ? request.sceneId : request.from)) return this.get(request.id);
      const next: Snapshot = { script: result.script, studio: structuredClone(previous.studio) };
      if (request.kind === 'scene') {
        if (Object.hasOwn(next.studio.scenes, request.to)) throw new Error('该名称已有保存的场景状态，请先检查后再改名。');
        if (target) { next.studio.scenes[request.to] = next.studio.scenes[request.sceneId]; delete next.studio.scenes[request.sceneId]; }
        if (typeof config.cover === 'string' && config.cover.split('@')[0] === request.sceneId) config.cover = request.to + config.cover.slice(request.sceneId.length);
      } else {
        for (const override of Object.values(next.studio.scenes[request.sceneId]?.elements ?? {})) for (const key of ['at', 'out'] as const) if (override.patch[key] === '#' + request.from) override.patch[key] = '#' + request.to;
      }
      next.studio.revision += 1; studioSchema.parse(next.studio);
      const validation = engine.analyzeReferences(next.script, result.sources, { language: config.language ?? 'en', config, studio: next.studio });
      if (!validation.ok) throw new Error(validation.issues.map((x: any) => x.message).slice(0, 3).join('\n'));
      const beforeFiles: Record<string, string> = {}; const afterFiles: Record<string, string> = {};
      for (const [file, source] of Object.entries(result.sources) as Array<[string, string]>) if (source !== sources[file]) { beforeFiles[file] = sources[file]; afterFiles[file] = source; }
      if (JSON.stringify(config) !== JSON.stringify(JSON.parse(configSource))) { beforeFiles['video.json'] = configSource; afterFiles['video.json'] = JSON.stringify(config, null, 2) + '\n'; }
      next.files = afterFiles; next.guards = beforeFiles;
      const beforeEntry: Snapshot = { ...previous, files: beforeFiles, guards: afterFiles };
      const oldName = request.sceneId; const newName = request.kind === 'scene' ? request.to : oldName;
      const voices = await this.captureVoices(folder, [oldName]); const cached = voices[oldName]; const audio: Record<string, Buffer> = {};
      if (cached) {
        const info = JSON.parse(cached.json); const oldScene = engine.parseScript(previous.script, { language: config.language ?? 'en' }).scenes.find((s: any) => s.id === oldName);
        const newScene = validation.script.scenes.find((s: any) => s.id === newName);
        const loaded = engine.loadProject(folder); const chunks = (s: any) => engine.speechChunks(s.units, { sentenceGap: loaded.config.sentenceGap, paragraphGap: loaded.config.paragraphGap, pace: loaded.config.pace, language: loaded.config.language });
        if (loaded.config.voice.provider !== 'recording' && info.hash === engine.sceneHash(oldScene, chunks(oldScene), loaded.config) && (!info.duration || cached.wavHash)) {
          const marks = { ...info.marks };
          if (request.kind === 'marker' && Object.hasOwn(marks, request.from!)) { marks[request.to] = marks[request.from!]; delete marks[request.from!]; }
          const updated = { ...info, id: newName, marks, hash: engine.sceneHash(newScene, chunks(newScene), loaded.config) };
          beforeEntry.voices = voices; next.voices = { [newName]: { json: JSON.stringify(updated, null, 2), wavHash: cached.wavHash } };
          if (newName !== oldName && cached.wavHash) audio[`build/voice/${newName}.wav`] = await readFile(join(folder, 'build/voice', `${oldName}.wav`));
        }
      }
      if (config.voice?.provider === 'recording' && request.kind === 'scene') throw new Error('录音项目改名还需同步录音文件，请先通过 Agent 迁移录音并运行验证。');
      if (await this.revision(folder, await this.snapshot(folder)) !== request.revision) throw new Error('项目已变化，请刷新后重试。');
      const history = await this.readHistory(folder);
      await this.writeSnapshot(folder, next, previous, { undo: [...history.undo, beforeEntry].slice(-30), redo: [] }, audio);
      return this.get(request.id);
    });
  }
  async history(id: string, direction: 'undo' | 'redo', revision: string): Promise<ProjectDetail> {
    return this.serial.run(id, async () => {
      this.assertIdle(id);
      const folder = await this.folder(id);
      const current = await this.snapshot(folder);
      if (await this.revision(folder, current) !== revision) throw new Error('项目已变化，请刷新后再撤销。');
      const history = await this.readHistory(folder);
      const next = history[direction].pop();
      if (!next) throw new Error(direction === 'undo' ? '没有可撤销的修改。' : '没有可重做的修改。');
      if (next.files) {
        current.files = {};
        for (const file of Object.keys(next.files)) current.files[file] = await readFile(join(folder, file), 'utf8');
        current.guards = next.files;
      }
      if (next.voices) current.voices = await this.captureVoices(folder, Object.keys(next.voices));
      history[direction === 'undo' ? 'redo' : 'undo'].push(current);
      await this.writeSnapshot(folder, next, current, history);
      return this.get(id);
    });
  }
}
