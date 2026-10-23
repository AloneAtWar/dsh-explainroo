// Adapt identifiers at the parser boundary; the upstream parser stays untouched.
import { createHash } from 'node:crypto';
import { parseScript as upstreamParse, ScriptError } from 'explainroo/src/script.js';
import { assertName } from './names.mjs';

export function asciiName(name, marker = false) {
  assertName(name, { marker });
  if ((marker ? /^[A-Za-z0-9_-]+$/ : /^[A-Za-z0-9][A-Za-z0-9_-]*$/).test(name)) return name;
  return `dsh_${marker ? 'm' : 's'}_${createHash('sha256').update(name).digest('hex').slice(0, 24)}`;
}

export function encodeScript(source) {
  const identities = { scenes: {}, markers: {} };
  function encode(name, marker) {
    const value = asciiName(name, marker);
    const table = marker ? identities.markers : identities.scenes;
    if (Object.hasOwn(table, value) && table[value] !== name) throw new Error('名称转换冲突，请更换名称。');
    table[value] = name;
    return value;
  }
  // Replace syntax tokens only. Visible words, colors and pronunciation overrides
  // are never globally substituted. The upstream parser still validates grammar.
  source = String(source);
  const masked = source.replace(/<!--[\s\S]*?(?:-->|$)/g, value => value.replace(/[^\r\n]/g, ' '));
  const changes = []; let offset = 0;
  for (const line of masked.split(/(?<=\n)/)) {
    const start = offset; offset += line.length;
    const trimmed = line.trim();
    if (trimmed.startsWith('>') || /^#\s/.test(trimmed)) continue;
    const heading = /^([\t ]*##[\t ]+)([^\s{]+)/u.exec(line);
    if (heading) {
      const at = start + heading[1].length;
      changes.push({ start: at, end: at + heading[2].length, text: encode(heading[2], false) });
      continue;
    }
    for (const token of line.matchAll(/\{[^}\n]*\}|\[#([^\]\n]*)\]/g)) if (token[1] !== undefined) changes.push({ start: start + token.index, end: start + token.index + token[0].length, text: `[#${encode(token[1], true)}]` });
  }
  let script = source;
  for (const change of changes.sort((a, b) => b.start - a.start)) script = script.slice(0, change.start) + change.text + script.slice(change.end);
  return { script, identities };
}

export function parseScript(source, options) {
  const encoded = encodeScript(source);
  let result;
  try { result = upstreamParse(encoded.script, options); }
  catch (error) {
    let message = error.message;
    for (const [ascii, original] of Object.entries({ ...encoded.identities.scenes, ...encoded.identities.markers })) message = message.split(ascii).join(original);
    throw new Error(message);
  }
  for (const scene of result.scenes) {
    scene.id = encoded.identities.scenes[scene.id] ?? scene.id;
    const seen = new Set();
    for (const unit of scene.units) if (unit.type === 'mark') {
      unit.name = encoded.identities.markers[unit.name] ?? unit.name;
      if (seen.has(unit.name)) throw new ScriptError(`marker "${unit.name}" is used twice in scene "${scene.id}"`, scene.line);
      seen.add(unit.name);
    }
  }
  return result;
}
