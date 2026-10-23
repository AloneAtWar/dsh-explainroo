import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
try {
  let config;
  try { config = JSON.parse(await readFile(new URL('../engine.json', import.meta.url), 'utf8')); }
  catch { config = { pluginRoot: fileURLToPath(new URL('../../../', import.meta.url)) }; }
  if (!config.pluginRoot) throw new Error('工作区需要重新安装 DSH skill，才能使用插件适配层。');
  const bridge = await import(pathToFileURL(join(config.pluginRoot, 'lib/bridge.js')).href);
  process.exitCode = await bridge.main(process.argv.slice(2), config.engineRoot);
} catch (error) { console.error(error.message); process.exitCode = 1; }
