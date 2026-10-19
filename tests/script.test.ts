import { describe, expect, it } from 'vitest';
import { replaceScene, sections } from '../src/host/script.ts';

describe('scene narration editing', () => {
  const source = '# 标题\r\n\r\n## intro {chapter="开头" hold=1}\r\n[#a] 原来的旁白。\r\n\r\n## next\r\n[#b] 下一场。\r\n';
  it('retains scene headers, cues in other scenes, and Windows line endings', () => {
    const edited = replaceScene(source, 'intro', '[#a] 新的旁白。\n第二句。');
    expect(edited).toContain('## intro {chapter="开头" hold=1}\r\n');
    expect(edited).toContain('[#a] 新的旁白。\r\n第二句。');
    expect(edited.endsWith('## next\r\n[#b] 下一场。\r\n')).toBe(true);
    expect(sections(edited).map(item => item.id)).toEqual(['intro', 'next']);
  });
  it('rejects inserting another scene from a narration field', () => {
    expect(() => replaceScene(source, 'intro', '## next\n替换')).toThrow('章节标题');
  });
  it('rejects a scene id that was removed by another editor', () => {
    expect(() => replaceScene(source, 'missing', '旁白')).toThrow('场景不存在');
  });
});
