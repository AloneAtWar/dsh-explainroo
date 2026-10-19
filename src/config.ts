import Schema from '@deepseek-ai/schemastery';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface Config { libraryRoot: string; engineRoot: string; dataDir: string; nodePath: string; workers: number }
export const Config = Schema.object({
  libraryRoot: Schema.string().default(join(homedir(), 'Videos', 'Explainroo')).description('本地视频项目目录'),
  engineRoot: Schema.string().default('').description('explainroo 引擎目录；留空自动查找已安装技能'),
  dataDir: Schema.string().default(join(homedir(), '.dsh-explainroo')).description('插件配置目录'),
  nodePath: Schema.string().default('node').description('运行 explainroo 的 Node.js 可执行文件'),
  workers: Schema.number().min(1).max(8).default(2).description('导出渲染并发数'),
});
export function defaults(): Config { return { libraryRoot: join(homedir(), 'Videos', 'Explainroo'), engineRoot: '', dataDir: join(homedir(), '.dsh-explainroo'), nodePath: 'node', workers: 2 }; }
