import fs from 'node:fs';
import path from 'node:path';
import { normalizeConfig as normalizeUpstream } from 'explainroo/src/project.js';
import { asciiName, parseScript } from './parser.mjs';
import { mimoHost, MIMO_MODEL } from './mimo.mjs';

export function normalizeConfig(raw, dir) {
  const compatible = { ...raw };
  if (typeof raw.cover === 'string' && raw.cover !== 'auto' && !/^\d+(\.\d+)?$/.test(raw.cover)) {
    const [id, ...tail] = raw.cover.split('@');
    compatible.cover = [asciiName(id), ...tail].join('@');
  }
  const voice = raw.voice;
  let mimo;
  if (voice?.provider === 'mimo') {
    if (Object.keys(voice).some(key => !['provider', 'id', 'model', 'host', 'style'].includes(key))) throw new Error('MiMo 配音设置包含不支持的字段。');
    if (typeof voice.id !== 'string' || !voice.id.trim()) throw new Error('MiMo 需要音色名称。');
    if (voice.model !== undefined && (typeof voice.model !== 'string' || !voice.model.trim())) throw new Error('MiMo 模型名称无效。');
    if (voice.style !== undefined && (typeof voice.style !== 'string' || voice.style.trim().length > 500)) throw new Error('MiMo 风格描述最多 500 字符。');
    mimo = { provider: 'mimo', id: voice.id.trim(), model: voice.model?.trim() ?? MIMO_MODEL, host: mimoHost(voice.host), ...(voice.style?.trim() ? { style: voice.style.trim() } : {}) };
    compatible.voice = { provider: 'recording', src: 'assets/dsh-narration/' };
  }
  const config = normalizeUpstream(compatible, dir);
  if (raw.cover !== undefined) config.cover = raw.cover;
  if (mimo) config.voice = mimo;
  return config;
}

// Project metadata is assembled here so user files can keep their original IDs
// and plugin voice settings. Only materialized copies enter upstream commands.
export function loadProject(dir) {
  dir = path.resolve(dir);
  const config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8')), dir);
  const script = parseScript(fs.readFileSync(path.join(dir, 'script.md'), 'utf8'), { language: config.language });
  if (!config.title) config.title = script.title || path.basename(dir);
  const build = path.join(dir, 'build');
  return { dir, config, script, paths: { build, out: path.join(dir, 'out'), voice: path.join(build, 'voice'), scenes: path.join(dir, 'scenes.js'), script: path.join(dir, 'script.md'), look: config.look ? path.resolve(dir, config.theme) : null } };
}
