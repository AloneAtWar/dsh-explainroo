import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Tasks } from '../src/host/tasks.ts';
import { Serial } from '../src/host/files.ts';
import type { Projects } from '../src/host/projects.ts';

describe('background process ownership', () => {
  let root: string; let tasks: Tasks;
  afterEach(async () => { await tasks?.close(); if (root) await rm(root, { recursive: true, force: true }); });
  async function prepare(code: string) {
    root = await mkdtemp(join(tmpdir(), 'explainroo-task-'));
    await mkdir(join(root, 'bin')); await writeFile(join(root, 'bin/explainroo.js'), code);
    const projects = { config: { nodePath: process.execPath, workers: 1 }, serial: new Serial(), get: async () => ({ folder: root, sceneCount: 1, allVoicesCached: true }), engineRoot: () => root } as unknown as Projects;
    tasks = new Tasks(projects);
    vi.spyOn(tasks, 'createRenderSnapshot').mockResolvedValue(root);
    vi.spyOn(tasks as any, 'workerArguments').mockReturnValue([join(root, 'bin/explainroo.js')]);
  }
  it('cancels the actual child process and releases project exclusivity', async () => {
    await prepare('console.log("ready");setInterval(()=>{},1000)');
    const first = await tasks.start('demo', 'voice');
    await expect(tasks.start('demo', 'voice')).rejects.toThrow('已有任务');
    const deadline = Date.now() + 5000;
    while (!tasks.list('demo')[0].log.includes('ready') && Date.now() < deadline) await new Promise(accept => setTimeout(accept, 15));
    expect(tasks.list('demo')[0].log).toContain('ready');
    expect((await tasks.cancel(first.id)).status).toBe('cancelled');
    const second = await tasks.start('demo', 'voice'); expect(second.id).not.toBe(first.id);
    await tasks.cancel(second.id);
  });
  it('reports a failed command instead of claiming generation completed', async () => {
    await prepare('console.error("fixture failure");process.exit(3)');
    const task = await tasks.start('demo', 'voice');
    const result = await tasks.wait(task.id);
    expect(result.status).toBe('failed'); expect(result.log).toContain('fixture failure'); expect(result.error).toContain('fixture failure');
  });
  it('reads bounded progress across partial child output without decreasing it', async () => {
    await prepare('process.stdout.write(\'@explainroo-progress {"progress":42,"phase":"render"}\\n@explainroo-pro\');setTimeout(()=>{process.stdout.write(\'gress {"progress":18,"phase":"render"}\\n\');},40);setInterval(()=>{},1000)');
    const task = await tasks.start('demo', 'voice');
    const deadline = Date.now() + 5000;
    while (!tasks.list('demo')[0].log.includes('progress":18') && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 15));
    expect(tasks.list('demo')[0]).toMatchObject({ progress: 42, phase: 'render', status: 'running' });
    await tasks.cancel(task.id);
  });
  it('serves only a completed owned export with a private attachment URL', async () => {
    await prepare('');
    vi.spyOn(tasks as any, 'execute').mockImplementation(async (running: any) => {
      const folder = join(root, '.explainroo', 'runs', running.info.id, 'out'); await mkdir(folder, { recursive: true });
      running.info.output = join(folder, 'storyboard.jpg'); await writeFile(running.info.output, 'fixture-export-bytes');
      running.info.status = 'completed'; return running.info;
    });
    const task = await tasks.start('demo', 'sheet'); await tasks.wait(task.id);
    const link = await tasks.download(task.id); const response = await fetch(link.url);
    expect(response.status).toBe(200); expect(await response.text()).toBe('fixture-export-bytes');
    expect(response.headers.get('content-disposition')).toContain('attachment;'); expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect((await fetch(new URL('/guess', link.url))).status).toBe(404);
    await expect(tasks.download('missing')).rejects.toThrow('尚未就绪');
    const internal = (tasks as any).entries.get(task.id).info; internal.output = join(root, 'private.txt'); await writeFile(internal.output, 'never-download');
    expect((await fetch(link.url)).status).toBe(404);
    internal.status = 'failed'; await expect(tasks.download(task.id)).rejects.toThrow('尚未就绪');
  });
  it('returns tasks from every project for the central task view while keeping project filtering', async () => {
    await prepare('console.log("local fixture");process.exit(3)');
    const first = await tasks.start('one', 'voice'); const second = await tasks.start('two', 'voice');
    await Promise.all([tasks.wait(first.id), tasks.wait(second.id)]);
    expect(tasks.list()).toHaveLength(2); expect(tasks.list('one').map(task => task.id)).toEqual([first.id]);
    expect(tasks.list('two')[0].id).toBe(second.id); expect(tasks.list().every(task => task.status === 'failed')).toBe(true);
  });
});
