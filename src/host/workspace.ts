import { existsSync } from 'node:fs';
import { lstat, mkdir, readdir, readFile, realpath, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FolderInspection, NewProjectRequest, WorkspaceSkill } from '../shared/types.ts';
import { Serial } from './files.ts';

const skillRelative = '.dsh/skills/explainroo';
const writes = new Serial();
export async function inspectFolder(path: string): Promise<FolderInspection> {
  if (!isAbsolute(path)) throw new Error('请选择目录的绝对路径。');
  const folder = await realpath(path);
  if (!(await lstat(folder)).isDirectory()) throw new Error('请选择文件夹。');
  const entries = await readdir(folder, { withFileTypes: true });
  const files = new Set(entries.filter(item => item.isFile()).map(item => item.name));
  let kind: FolderInspection['kind'] = entries.length ? 'occupied' : 'empty';
  if (files.has('video.json') && files.has('script.md')) kind = 'project';
  else if (entries.some(item => item.isDirectory() && !item.name.startsWith('.') && existsSync(join(folder, item.name, 'video.json')) && existsSync(join(folder, item.name, 'script.md')))) kind = 'library';
  return { folder, kind, entries: entries.map(item => item.name).slice(0, 12) };
}
export async function workspaceSkill(folder: string): Promise<WorkspaceSkill> {
  let discoveryRoot = folder;
  for (let current = folder; ; current = dirname(current)) {
    if (existsSync(join(current, '.git'))) { discoveryRoot = current; break; }
    if (dirname(current) === current) break;
  }
  const path = join(folder, skillRelative, 'SKILL.md');
  return { path, installed: existsSync(path) && (await lstat(path)).isFile(), discoveryRoot };
}
async function skillFiles(engineRoot: string): Promise<Map<string, string | Buffer>> {
  const candidates = ['../skills/explainroo/', '../../skills/explainroo/'].map(path => fileURLToPath(new URL(path, import.meta.url)));
  const root = candidates.find(path => existsSync(join(path, 'SKILL.md')));
  if (!root) throw new Error('插件安装包缺少 explainroo skill，请重新安装插件。');
  const files = new Map<string, string | Buffer>();
  async function collect(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Skill 资源不能是符号链接。');
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile()) files.set(join(skillRelative, relative(root!, path)), await readFile(path));
    }
  }
  await collect(root);
  const pluginRoot = resolve(root, '../..');
  files.set(join(skillRelative, 'references/upstream-guide.md'), await readFile(join(engineRoot, 'AGENTS.md')));
  files.set(join(skillRelative, 'UPSTREAM_LICENSE'), await readFile(join(engineRoot, 'LICENSE')));
  files.set(join(skillRelative, 'engine.json'), JSON.stringify({ engineRoot, pluginRoot }, null, 2) + '\n');
  return files;
}
// Exclusive creates and a narrow rollback preserve files written by another window.
async function writeTree(folder: string, files: Map<string, string | Buffer>): Promise<void> {
  const created: Array<[string, string | Buffer]> = []; const directories: string[] = [];
  async function directory(path: string): Promise<void> {
    if (path === folder) return;
    const rel = relative(folder, path);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('目标路径超出项目目录。');
    await directory(dirname(path));
    try { await mkdir(path); directories.push(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const entry = await lstat(path);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Skill 目录包含链接或非目录文件，已停止安装。');
  }
  try {
    for (const [name, content] of files) {
      const path = resolve(folder, name);
      const rel = relative(folder, path);
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('目标路径超出项目目录。');
      await directory(dirname(path));
      await writeFile(path, content, { flag: 'wx' }); created.push([path, content]);
    }
  } catch (error) {
    for (const [path, content] of created.reverse()) {
      try { if ((await readFile(path)).equals(Buffer.from(content)) && !(await lstat(path)).isSymbolicLink()) await unlink(path); } catch { /* retain externally changed files */ }
    }
    for (const path of directories.reverse()) { try { await rmdir(path); } catch { /* retain nonempty directories */ } }
    throw error;
  }
}
export async function createWorkspace(request: NewProjectRequest, engineRoot: string): Promise<string> {
  const folder = (await inspectFolder(request.folder)).folder;
  return writes.run(folder, async () => {
    if ((await inspectFolder(folder)).kind !== 'empty') throw new Error('此目录已包含文件。请选择空目录，已有文件不会被覆盖。');
    const files = await skillFiles(engineRoot);
    // Publish project identification last, so a partially written folder is never listed.
    files.set('scenes.js', 'export default {};\n');
    files.set('.gitignore', '.env\nbuild/\nout/\n.explainroo/runs/\n');
    files.set('script.md', `# ${request.title}\n\n`);
    files.set('video.json', JSON.stringify({ title: request.title, language: 'zh', size: request.size, theme: request.theme, fps: 30, pace: 1.3, captions: true }, null, 2) + '\n');
    await writeTree(folder, files);
    return folder;
  });
}
export async function createWorkspaceProject(request: NewProjectRequest, engineRoot: string): Promise<string> {
  const root = (await inspectFolder(request.folder)).folder;
  const container = join(root, 'projects'); const folder = join(container, request.directory!);
  return writes.run('workspace:' + root, async () => {
    try { await mkdir(container); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const entry = await lstat(container);
    if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('projects 必须是工作台内的真实目录。');
    try { await mkdir(folder); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('此项目目录已存在，请换一个目录名。'); throw error; }
    try {
      await installWorkspaceSkill(root, engineRoot);
      return await createWorkspace({ ...request, folder }, engineRoot);
    } catch (error) { try { await rmdir(folder); } catch { /* keep any created or externally changed files */ } throw error; }
  });
}
export async function installWorkspaceSkill(folder: string, engineRoot: string): Promise<WorkspaceSkill> {
  return writes.run(folder, async () => {
    const status = await workspaceSkill(folder);
    if (status.installed) return status;
    if (existsSync(join(folder, skillRelative))) throw new Error('已存在 explainroo skill 目录，请先检查其中的文件；安装不会覆盖它。');
    await writeTree(folder, await skillFiles(engineRoot));
    return workspaceSkill(folder);
  });
}
