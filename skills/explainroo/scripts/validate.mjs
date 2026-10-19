import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
try {
  let engineRoot;
  try { engineRoot = JSON.parse(await readFile(new URL('../engine.json', import.meta.url), 'utf8')).engineRoot; }
  catch { engineRoot = fileURLToPath(new URL('../app/', import.meta.url)); }
  const { validateProjectReferences } = await import(pathToFileURL(join(engineRoot, 'src/references.js')).href);
  const result = validateProjectReferences(resolve(process.argv[2] ?? '.'));
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
} catch (error) { console.log(JSON.stringify({ ok: false, issues: [{ code: 'validator', message: error.message }] }, null, 2)); process.exitCode = 1; }
