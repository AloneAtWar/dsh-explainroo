export interface NarrationPart { token: string; marker?: string; pause?: string; text: string }
export function narrationParts(raw: string): NarrationPart[] {
  const parts: NarrationPart[] = []; let cursor = 0;
  const matches = [...raw.matchAll(/\[#([^\]\r\n]+)\]|\[pause(?:\s+(\d+(?:\.\d+)?))?\]/gu)];
  for (const match of matches) {
    const before = raw.slice(cursor, match.index);
    if (!parts.length && before) parts.push({ token: '', text: before });
    else if (parts.length) parts[parts.length - 1].text = before;
    parts.push({ token: match[0], ...(match[1] ? { marker: match[1] } : { pause: match[2] ?? '0.5' }), text: '' });
    cursor = match.index! + match[0].length;
  }
  if (!parts.length) return [{ token: '', text: raw }];
  parts[parts.length - 1].text = raw.slice(cursor);
  return parts;
}

export interface NarrationAnchor { token: string; marker?: string; pause?: string; offset: number }
export interface NarrationDocument { text: string; anchors: NarrationAnchor[] }
/** Plain text and exact cue positions used by copied scene references. */
export function narrationDocument(raw: string): NarrationDocument {
  let text = ''; const anchors: NarrationAnchor[] = [];
  for (const part of narrationParts(raw)) {
    if (part.token) anchors.push({ token: part.token, marker: part.marker, pause: part.pause, offset: text.length });
    text += part.text;
  }
  return { text, anchors };
}
