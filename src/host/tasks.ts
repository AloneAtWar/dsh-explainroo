import { randomUUID, randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile, lstat, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { createReadStream } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { TaskAction, TaskInfo } from '../shared/types.ts';
import { runtimeAsset } from './preview.ts';
import type { Projects } from './projects.ts';
import { previewData } from './engine.ts';
import { materializeCompatibility, completedVoices } from './compatibility.ts';

interface Running { info: TaskInfo; revision?: string; child?: ChildProcess; cancelled: boolean; done: Promise<TaskInfo> }
export class Tasks {
  private entries = new Map<string, Running>();
  private downloadServer?: Promise<Server>;
  private downloads = new Map<string, { taskId: string; expiresAt: number }>();
  constructor(private projects: Projects) { projects.isBusy = id => [...this.entries.values()].some(task => task.info.projectId === id && task.info.status === 'running'); }
  list(id?: string): TaskInfo[] { return [...this.entries.values()].filter(task => !id || task.info.projectId === id).map(task => ({ ...task.info })).reverse(); }
  hasRunning(): boolean { return [...this.entries.values()].some(task => task.info.status === 'running'); }
  async start(id: string, action: TaskAction): Promise<TaskInfo> {
    return this.projects.serial.run(id, async () => {
      if (this.projects.isBusy(id)) throw new Error('该项目已有任务正在运行。');
      const project = await this.projects.get(id);
      if (!project.sceneCount) throw new Error('请先创建至少一个场景，再生成配音或导出。');
      if (typeof this.projects.validate === 'function') {
        const report = await this.projects.validate(id); if (!report.ok) throw new Error(report.issues[0]?.message ?? '场景引用验证失败。');
      }
      if (action === 'check' && !project.allVoicesCached) throw new Error('部分旁白尚未配音或已修改。');
      const info: TaskInfo = { id: randomUUID(), projectId: id, projectTitle: project.title, projectFolder: project.folder, action, status: 'running', startedAt: Date.now(), log: '', progress: 0, phase: 'preparing' };
      const running: Running = { info, revision: project.revision, cancelled: false, done: Promise.resolve(info) };
      this.entries.set(info.id, running);
      // Retain only the most recent finished tasks; active process handles are never dropped.
      for (const [key, task] of this.entries) if (this.entries.size > 40 && task.info.status !== 'running') this.entries.delete(key);
      running.done = this.execute(running, project.folder).catch(error => { info.status = running.cancelled ? 'cancelled' : 'failed'; info.error = error instanceof Error ? error.message : String(error); info.endedAt = Date.now(); return info; });
      return { ...info };
    });
  }
  async wait(taskId: string): Promise<TaskInfo> {
    const task = this.entries.get(taskId); if (!task) throw new Error('任务不存在。'); return task.done;
  }
  async download(taskId: string): Promise<{ url: string; filename: string }> {
    const task = this.entries.get(taskId)?.info;
    if (!task || task.status !== 'completed' || !task.output || !['render', 'sheet'].includes(task.action)) throw new Error('导出文件尚未就绪。');
    const filename = `${(task.projectTitle ?? 'video').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 90)}${task.action === 'render' ? '.mp4' : '-分镜图.jpg'}`;
    for (const [key, value] of this.downloads) if (value.expiresAt < Date.now()) this.downloads.delete(key);
    const token = randomBytes(24).toString('hex'); this.downloads.set(token, { taskId, expiresAt: Date.now() + 600000 });
    if (!this.downloadServer) this.downloadServer = new Promise<Server>((resolve, reject) => {
      const server = createServer(async (req, res) => {
        try {
          const capability = this.downloads.get((req.url ?? '').slice(1));
          const entry = capability && capability.expiresAt >= Date.now() ? this.entries.get(capability.taskId)?.info : undefined;
          const port = (server.address() as { port: number }).port;
          if (!['GET', 'HEAD'].includes(req.method ?? '') || req.headers.host !== `127.0.0.1:${port}` || !entry?.output || entry.status !== 'completed') { res.writeHead(404); res.end(); return; }
          const path = await realpath(entry.output); const root = await realpath(join(entry.projectFolder!, '.explainroo', 'runs', entry.id));
          const rel = relative(root, path); const stat = await lstat(entry.output);
          if (rel.startsWith('..') || isAbsolute(rel) || !stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid export file');
          const name = `${(entry.projectTitle ?? 'video').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 90)}${entry.action === 'render' ? '.mp4' : '-分镜图.jpg'}`;
          res.writeHead(200, { 'Content-Type': entry.action === 'render' ? 'video/mp4' : 'image/jpeg', 'Content-Length': stat.size, 'Content-Disposition': `attachment; filename="export.${entry.action === 'render' ? 'mp4' : 'jpg'}"; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          if (req.method === 'HEAD') res.end(); else createReadStream(path).on('error', () => res.destroy()).pipe(res);
        } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
      });
      server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server));
    });
    const server = await this.downloadServer;
    return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/${token}`, filename };
  }
  async cancel(taskId: string): Promise<TaskInfo> {
    const task = this.entries.get(taskId); if (!task) throw new Error('任务不存在。');
    if (task.info.status !== 'running') return { ...task.info };
    task.cancelled = true;
    if (task.child?.pid) {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(task.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        await new Promise<void>(accept => { killer.once('close', () => accept()); killer.once('error', () => { task.child?.kill(); accept(); }); });
      } else { try { process.kill(-task.child.pid, 'SIGTERM'); } catch { task.child.kill('SIGTERM'); } }
    }
    return { ...(await task.done) };
  }
  async createRenderSnapshot(folder: string, taskId: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]+$/.test(taskId)) throw new Error('任务副本名称无效。');
    const root = await realpath(folder);
    for (const name of ['.explainroo', '.explainroo/runs']) {
      const target = join(folder, name); await mkdir(target, { recursive: true });
      const rel = relative(root, await realpath(target));
      if ((await lstat(target)).isSymbolicLink() || rel.startsWith('..') || isAbsolute(rel)) throw new Error('任务目录必须位于当前项目中，不能是外部链接。');
    }
    const destination = join(folder, '.explainroo', 'runs', taskId);
    await mkdir(destination);
    const snapshot = await this.projects.snapshot(folder);
    await materializeCompatibility(this.projects.engineRoot(), folder, destination, snapshot.studio);
    return destination;
  }
  private workerArguments(folder: string, action: TaskAction, original: string): string[] {
    return [runtimeAsset('export-worker.js'), this.projects.engineRoot(), folder, action, original, String(this.projects.config.workers)];
  }
  private async execute(task: Running, folder: string): Promise<TaskInfo> {
    const { info } = task;
    const projectPath = await this.createRenderSnapshot(folder, info.id);
    if ((await this.projects.get(info.projectId)).revision !== task.revision) throw new Error('创建兼容副本期间项目已变化，请重试。');
    if (info.action === 'check') {
      const snapshot = await previewData(this.projects.engineRoot(), projectPath);
      if (snapshot.cached.size !== snapshot.timeline.scenes.length) throw new Error('创建导出快照期间旁白发生变化，请先生成配音后重试。');
    }
    if (task.cancelled) { info.status = 'cancelled'; info.endedAt = Date.now(); return info; }
    const exporting = info.action === 'render' || info.action === 'sheet';
    const args = this.workerArguments(projectPath, info.action, folder);
    if (exporting) info.output = join(projectPath, 'out', info.action === 'render' ? 'video.mp4' : 'storyboard.jpg');
    await new Promise<void>((accept, reject) => {
      const child = spawn(this.projects.config.nodePath, args, { cwd: folder, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      task.child = child;
      let pending = '';
      const append = (chunk: Buffer) => {
        const text = chunk.toString('utf8'); info.log = (info.log + text).slice(-60000); pending += text;
        const lines = pending.split('\n'); pending = lines.pop() ?? '';
        for (const line of lines) if (line.startsWith('@explainroo-progress ')) {
          try { const data = JSON.parse(line.slice(21)); if (Number.isFinite(data.progress)) info.progress = Math.max(info.progress ?? 0, Math.min(99, Math.round(data.progress))); if (['preparing', 'voice', 'render', 'sheet', 'finished'].includes(data.phase)) info.phase = data.phase; } catch { /* child output is diagnostic */ }
        }
      };
      child.stdout?.on('data', append); child.stderr?.on('data', append);
      child.once('error', reject); child.once('close', code => { if (task.cancelled || code === 0) accept(); else { const reason = info.log.split('\n').filter(line => line.trim() && !line.startsWith('@explainroo-progress ')).at(-1); reject(new Error(`${reason ?? `explainroo ${info.action} 退出码 ${code}`}`)); } });
    });
    if (!task.cancelled && ['voice', 'render'].includes(info.action)) {
      const values = await completedVoices(this.projects.engineRoot(), projectPath);
      if (!task.cancelled && !await this.projects.persistVoices(info.projectId, task.revision!, values)) info.log += '\n项目已变化，生成的配音保留在任务副本中，未回写原项目。';
    }
    info.status = task.cancelled ? 'cancelled' : 'completed'; info.endedAt = Date.now();
    if (!task.cancelled && exporting && !(await lstat(info.output!)).isFile()) throw new Error('未生成导出文件。');
    if (!task.cancelled) { info.progress = 100; info.phase = 'finished'; }
    await mkdir(join(folder, '.explainroo', 'logs'), { recursive: true });
    await writeFile(join(folder, '.explainroo', 'logs', `${info.id}.log`), info.log);
    return info;
  }
  async close(): Promise<void> { await Promise.allSettled([...this.entries].filter(([, task]) => task.info.status === 'running').map(([id]) => this.cancel(id))); if (this.downloadServer) { const server = await this.downloadServer; server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } }
}
