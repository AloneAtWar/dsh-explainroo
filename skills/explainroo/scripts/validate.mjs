import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
try {
  let config;
  try { config = JSON.parse(await readFile(new URL('../engine.json', import.meta.url), 'utf8')); }
  catch { config = { pluginRoot: fileURLToPath(new URL('../../../', import.meta.url)) }; }
  if (!config.pluginRoot) throw new Error('请从 DSH 插件更新工作区 skill；验证器属于插件，不属于原版引擎。');
  const { validateProjectReferences } = await import(pathToFileURL(join(config.pluginRoot, 'lib/bridge.js')).href);
  const result = validateProjectReferences(resolve(process.argv[2] ?? '.'));
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.ok ? 0 : 1;
} catch (error) { console.log(JSON.stringify({ ok: false, issues: [{ code: 'validator', message: error.message }] }, null, 2)); process.exitCode = 1; }
