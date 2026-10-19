export interface ScriptSection { id: string; start: number; end: number; raw: string }
export function sections(source: string): ScriptSection[] {
  const headings = [...source.matchAll(/^##[\t ]+([^\s{]+)[^\r\n]*(?:\r?\n|$)/gm)];
  return headings.map((match, index) => {
    const start = match.index! + match[0].length;
    const end = headings[index + 1]?.index ?? source.length;
    return { id: match[1], start, end, raw: source.slice(start, end).trim() };
  });
}
export function replaceScene(source: string, sceneId: string, raw: string): string {
  if (/^#{1,2}\s/m.test(raw)) throw new Error('请在场景正文中编辑旁白；不要插入章节标题。');
  const section = sections(source).find(item => item.id === sceneId);
  if (!section) throw new Error(`场景不存在：${sceneId}`);
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return source.slice(0, section.start) + raw.trim().replace(/\r?\n/g, eol) + eol + eol + source.slice(section.end);
}
