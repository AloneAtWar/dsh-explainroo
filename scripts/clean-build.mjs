import { lstat, realpath, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const output = join(root, 'lib');
try {
  const entry = await lstat(output);
  if (entry.isSymbolicLink() || dirname(await realpath(output)) !== root) throw new Error('Build output must be the project’s own lib directory.');
  await rm(output, { recursive: true, force: true });
} catch (error) { if (error.code !== 'ENOENT') throw error; }
