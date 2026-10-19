import { describe, expect, it } from 'vitest';
import { narrationParts, narrationDocument } from '../src/client/narration.ts';

describe('narration token parsing and locator positions', () => {
  it('preserves Chinese cues, exact pause syntax, whitespace and pronunciation overrides', () => {
    const raw = '开头\r\n[#认识账户] 要理解 {Solana|索拉纳}。[pause 0.60][#全部] 全部内容。\n';
    const parts = narrationParts(raw);
    expect(parts.map(part => part.token + part.text).join('')).toBe(raw);
    expect(parts.map(part => part.marker).filter(Boolean)).toEqual(['认识账户', '全部']);
    expect(parts.every(part => !part.text.includes('[#'))).toBe(true);
  });
  it('handles empty text, adjacent cues and default pauses without inventing markers', () => {
    for (const raw of ['', '普通旁白', '[#甲][#乙]正文', '[pause]']) {
      expect(narrationParts(raw).map(part => part.token + part.text).join('')).toBe(raw);
    }
    expect(narrationParts('[pause]')[0].pause).toBe('0.5');
  });
  it('copies cue offsets in the complete plain narration including paragraphs and emoji', () => {
    const document = narrationDocument('开头😀\n[#认识账户]账户里有余额[#全部]、代币和状态。');
    expect(document.text).toBe('开头😀\n账户里有余额、代币和状态。');
    expect(document.anchors.map(anchor => [anchor.marker, anchor.offset])).toEqual([['认识账户', 5], ['全部', 11]]);
    expect(document.text.slice(document.anchors[1].offset)).toBe('、代币和状态。');
  });
});
