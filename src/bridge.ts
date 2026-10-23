import { basename, dirname, resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaults } from './config.ts';
import { findEngine } from './host/engine.ts';
import { Projects } from './host/projects.ts';
import { Tasks } from './host/tasks.ts';
import { MIMO_VOICES } from './host/compat/mimo.mjs';
export { parseScript } from './host/compat/parser.mjs';
export { analyzeReferences, validateProjectReferences } from './host/compat/references.mjs';

/** Workspace scripts use the same service and compatibility path as Desktop. */
export async function main(args: string[], engineRoot = findEngine(defaults())): Promise<number> {
  const [action, ...rest] = args;
  if (!action || ['--help', '-h', 'help'].includes(action)) {
    console.log('DSH explainroo: voice | check | sheet | render | validate <project> [--json]\nRead-only upstream commands: doctor | voices | themes | formats | icons'); return 0;
  }
  if (action === 'voices' && rest.includes('--mimo')) { console.log(JSON.stringify(MIMO_VOICES)); return 0; }
  if (['doctor', 'voices', 'themes', 'formats', 'icons'].includes(action)) {
    return (await import(pathToFileURL(join(engineRoot, 'src/cli.js')).href)).main(args);
  }
  const folder = resolve(rest.find(value => !value.startsWith('--')) ?? '.');
  if (action === 'validate') {
    const { validateProjectReferences } = await import('./host/compat/references.mjs');
    const report = validateProjectReferences(folder); console.log(JSON.stringify(report, null, 2)); return report.ok ? 0 : 1;
  }
  if (!['voice', 'check', 'sheet', 'render'].includes(action) || rest.filter(value => value.startsWith('--')).some(value => value !== '--json') || rest.filter(value => !value.startsWith('--')).length > 1) throw new Error('此入口支持 voice/check/sheet/render/validate <项目> [--json]；尺寸和主题请在项目设置中修改，预览请使用工作台。');
  const projects = new Projects({ ...defaults(), libraryRoot: dirname(folder), engineRoot, nodePath: process.execPath });
  const tasks = new Tasks(projects);
  try {
    const started = await tasks.start(basename(folder), action as 'voice' | 'check' | 'sheet' | 'render');
    const result = await tasks.wait(started.id);
    if (rest.includes('--json')) console.log(JSON.stringify(result));
    else console.log([result.log, result.output, result.error].filter(Boolean).join('\n'));
    return result.status === 'completed' ? 0 : 1;
  } finally { await tasks.close(); }
}
