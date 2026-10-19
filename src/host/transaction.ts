import { lstat, readFile, realpath, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { atomicWrite } from './files.ts';

const journalName = '.explainroo/pending-edit.json';
const pending = new Map<string, Promise<void>>();
interface Entry { name: string; before: string | null; after: string }
async function bytes(file: string): Promise<Buffer | null> { try { return await readFile(file); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } }
async function inside(folder: string, name: string): Promise<string> {
  if (!/^(?:script\.md|video\.json|(?:[^./\\][^/\\]*\/)*[^./\\][^/\\]*\.m?js|\.explainroo\/(?:studio|history)\.json|build\/voice\/[^/\\]+\.(?:json|wav))$/u.test(name) || name.split('/').some(p => p === '..')) throw new Error('事务文件路径无效。');
  const target = resolve(folder, name); const rel = relative(folder, target);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('事务文件超出项目目录。');
  let probe = target;
  while (true) { try { if ((await lstat(probe)).isSymbolicLink()) throw new Error('事务文件不能通过链接写入。'); await realpath(probe); break; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; probe = dirname(probe); } }
  const real = await realpath(probe); const realRel = relative(await realpath(folder), real);
  if (realRel.startsWith('..') || isAbsolute(realRel)) throw new Error('事务文件链接超出项目目录。');
  return target;
}
function encoded(value: Buffer | null): string | null { return value?.toString('base64') ?? null; }
async function rollback(folder: string, entries: Entry[]) {
  for (const entry of [...entries].reverse()) {
    const target = await inside(folder, entry.name); const current = encoded(await bytes(target));
    if (current === entry.before) continue;
    if (current !== entry.after) throw new Error(`修改中断，${entry.name} 又被外部修改；已保留现场，请先恢复该文件。`);
    if (entry.before === null) await unlink(target); else await atomicWrite(target, Buffer.from(entry.before, 'base64'));
  }
}
export async function stableProject(folder: string): Promise<void> {
  const active = pending.get(folder); if (active) { await active; return stableProject(folder); }
  const journal = await bytes(join(folder, journalName)); if (!journal) return;
  const data = JSON.parse(journal.toString('utf8')) as { version: number; entries: Entry[] };
  if (data.version !== 1 || !Array.isArray(data.entries)) throw new Error('项目恢复记录无效。');
  await rollback(folder, data.entries); await unlink(join(folder, journalName));
}
export async function writeProjectTransaction(folder: string, values: Record<string, string | Buffer>, expected: Record<string, string | null> = {}): Promise<void> {
  await stableProject(folder);
  let finish!: () => void; const done = new Promise<void>(accept => { finish = accept; }); pending.set(folder, done);
  const entries: Entry[] = [];
  try {
    for (const [name, value] of Object.entries(values)) {
      const target = await inside(folder, name); const previous = await bytes(target);
      if (Object.hasOwn(expected, name) && (previous?.toString('utf8') ?? null) !== expected[name]) throw new Error('文件已被其他窗口或 AI 修改，请刷新后重试。');
      const entry = { name, before: encoded(previous), after: Buffer.from(value).toString('base64') };
      if (entry.before !== entry.after) entries.push(entry);
    }
    if (!entries.length) return;
    await atomicWrite(join(folder, journalName), JSON.stringify({ version: 1, entries }));
    try {
      for (const entry of entries) {
        const target = await inside(folder, entry.name);
        if (encoded(await bytes(target)) !== entry.before) throw new Error('文件在保存期间被外部修改。');
        await atomicWrite(target, Buffer.from(entry.after, 'base64'));
      }
    } catch (error) { await rollback(folder, entries); throw error; }
    await unlink(join(folder, journalName));
  } finally { pending.delete(folder); finish(); }
}
