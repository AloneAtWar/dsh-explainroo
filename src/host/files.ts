import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function digest(value: string): string { return createHash('sha256').update(value).digest('hex').slice(0, 20); }
export async function readOptional(file: string): Promise<string | null> {
  try { return await readFile(file, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function atomicWrite(file: string, value: string | Uint8Array): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, value, 'utf8'); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
export class Serial {
  private pending = new Map<string, Promise<unknown>>();
  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const current = (this.pending.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
    this.pending.set(key, current);
    try { return await current; } finally { if (this.pending.get(key) === current) this.pending.delete(key); }
  }
}
