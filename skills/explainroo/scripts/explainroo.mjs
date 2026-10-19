import { readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  let config;
  try { config = JSON.parse(await readFile(new URL('../engine.json', import.meta.url), 'utf8')); }
  catch { config = { engineRoot: fileURLToPath(new URL('../app/', import.meta.url)) }; }
  if (typeof config.engineRoot !== 'string' || !isAbsolute(config.engineRoot)) throw new Error('engine.json 缺少有效的引擎路径。');
  const entry = join(config.engineRoot, 'bin/explainroo.js');
  await access(entry);
  const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit', windowsHide: true, shell: false });
  child.on('error', error => { console.error(`Explainroo: ${error.message}`); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) {
  console.error(`Explainroo 引擎不可用：${error.message} 请在工作台检查引擎目录，并更新此 skill 的 engine.json。`);
  process.exitCode = 1;
}
