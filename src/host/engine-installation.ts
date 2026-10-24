import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import type { Config } from '../config.ts';
import type { EngineInstallation } from '../shared/types.ts';
import upstream from '../../upstream.json';

const require = createRequire(import.meta.url);
function dependencyManifest(): string {
  try { return require.resolve('explainroo/package.json'); }
  catch { return ''; }
}
function engineFolder(candidate: string): string {
  if (!candidate) return '';
  return [resolve(candidate), resolve(candidate, 'app')].find(root =>
    ['src/project.js', 'engine/runtime.js', 'bin/explainroo.js'].every(file => existsSync(join(root, file))),
  ) ?? '';
}
export function inspectEngine(config: Pick<Config, 'engineRoot'>, manifest = dependencyManifest()): EngineInstallation {
  const installed = manifest ? engineFolder(dirname(manifest)) : '';
  const environment = process.env.EXPLAINROO_HOME ?? '';
  const source = config.engineRoot ? 'custom' : environment ? 'environment' : 'dependency';
  const root = source === 'dependency' ? installed : engineFolder(config.engineRoot || environment);
  let version: string | undefined;
  if (root) {
    try { const value = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version; if (typeof value === 'string') version = value; }
    catch { /* A custom engine can predate package metadata. */ }
  }
  return { root, source, ready: !!root, defaultReady: !!installed, expectedVersion: upstream.version, ...(version ? { version } : {}) };
}
export function engineRecoveryMessage(engine: EngineInstallation): string {
  if (engine.source === 'custom') return '自定义引擎目录不可用。请在安装引导中使用默认引擎，或重新选择完整的 Explainroo 引擎目录。';
  if (engine.source === 'environment') return 'EXPLAINROO_HOME 指向的引擎不可用。请更正该环境变量并重启 Harness，或在高级设置选择可用引擎。';
  return 'Explainroo 引擎未安装完整。请重新安装插件并重启 Harness，再点击“重新检测”；安装与修复步骤见工作台设置。';
}
