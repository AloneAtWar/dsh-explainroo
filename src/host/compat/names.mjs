// Shared by the parser, reference checker and workbench. Names are the real
// keys, not translated labels. NFC avoids visually identical Unicode keys.
export const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]*$/u;
export function validName(value, { marker = false } = {}) {
  return typeof value === 'string' && value === value.normalize('NFC') && [...value].length <= 80
    && (marker && /^[_-][\p{L}\p{M}\p{N}_-]*$/u.test(value) || NAME_RE.test(value))
    && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(value)
    && !['__proto__', 'constructor', 'prototype'].includes(value);
}
export function assertName(value, options) {
  if (!validName(value, options)) throw new Error('名称使用中文、字母、数字、下划线或短横线，最多 80 字符；不含空格和路径符号。');
  return value;
}
