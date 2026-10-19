import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, AllSelection, type Transaction } from 'prosemirror-state';
import { history, undo, redo } from 'prosemirror-history';
import { inlineNarration, inlineNarrationSource, moveNarrationCue, narrationCues, narrationSchema, protectNarrationCues, replaceNarrationSelection } from '../src/client/inline-narration.ts';

const stateFor = (raw: string) => EditorState.create({ schema: narrationSchema, doc: inlineNarration(raw), plugins: [history()] });
const apply = (state: EditorState, transaction: Transaction) => state.apply(protectNarrationCues(state, transaction));
describe('inline protected narration cues', () => {
  it('round-trips Chinese names, exact pause tokens, pronunciation and multiline whitespace', () => {
    for (const raw of ['', '普通旁白', '[#认识账户] 要理解 {Solana|索拉纳}。\r\n[ pause ][pause 0.60][#全部]余额\n\n代币。', '[#甲][#乙][pause]']) expect(inlineNarrationSource(inlineNarration(raw))).toBe(raw);
  });
  it('moves the existing atom into the text without changing words or duplicating the cue', () => {
    let state = stateFor('[#账户]余额、代币[#状态]、程序状态。');
    const id = narrationCues(state.doc)[1].node.attrs.id;
    state = apply(state, moveNarrationCue(state, id, 3)!);
    expect(inlineNarrationSource(state.doc)).toBe('[#账户]余额[#状态]、代币、程序状态。');
    expect(narrationCues(state.doc)).toHaveLength(2);
  });
  it('keeps a cue when Backspace or Delete would remove only that atom', () => {
    const state = stateFor('开头[#不能误删]结尾'); const cue = narrationCues(state.doc)[0];
    const next = apply(state, state.tr.delete(cue.pos, cue.pos + 1));
    expect(inlineNarrationSource(next.doc)).toBe('开头[#不能误删]结尾');
  });
  it('allows Select All and replacement while retaining every existing cue exactly once', () => {
    const original = stateFor('[#账户]原始开头[#内容]原始内容[pause 0.7][#唯一]原始结尾');
    const state = original.apply(original.tr.setSelection(new AllSelection(original.doc)));
    const next = apply(state, replaceNarrationSelection(state, '全新的开头。\n全新的正文。'));
    expect(next.doc.textContent).toBe('全新的开头。\n全新的正文。');
    expect(narrationCues(next.doc).map(c => c.node.attrs.token)).toEqual(['[#账户]', '[#内容]', '[pause 0.7]', '[#唯一]']);
    expect(inlineNarrationSource(next.doc).replace(/\[#.*?\]|\[pause.*?\]/g, '')).toBe('全新的开头。\n全新的正文。');
  });
  it('deletes all narration words without deleting any trigger or pause', () => {
    const state = stateFor('[#甲]中文正文[pause][#乙]结束');
    const next = apply(state, state.tr.delete(0, state.doc.content.size));
    expect(inlineNarrationSource(next.doc)).toBe('[#甲][pause][#乙]');
  });
  it('supports undo and redo of cue dragging and whole-text replacement with original positions', () => {
    let state = stateFor('[#甲]第一句。[#乙]第二句。'); const initial = inlineNarrationSource(state.doc);
    const cue = narrationCues(state.doc)[1]; state = apply(state, moveNarrationCue(state, cue.node.attrs.id, 2)!);
    const moved = inlineNarrationSource(state.doc);
    expect(undo(state, tr => { state = apply(state, tr); })).toBe(true); expect(inlineNarrationSource(state.doc)).toBe(initial);
    expect(redo(state, tr => { state = apply(state, tr); })).toBe(true); expect(inlineNarrationSource(state.doc)).toBe(moved);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 0, state.doc.content.size)));
    state = apply(state, replaceNarrationSelection(state, '新内容'));
    expect(undo(state, tr => { state = apply(state, tr); })).toBe(true); expect(inlineNarrationSource(state.doc)).toBe(moved);
  });
  it('rejects a foreign or duplicated cue instead of introducing dangling timing references', () => {
    const state = stateFor('[#甲]正文'); const cue = narrationCues(state.doc)[0].node;
    const extra = narrationSchema.nodes.cue.create({ ...cue.attrs, id: 'foreign', name: '伪造', token: '[#伪造]' });
    const next = apply(state, state.tr.insert(state.doc.content.size, [cue, extra]));
    expect(inlineNarrationSource(next.doc)).toBe('[#甲]正文');
  });
  it('does not split emoji or combining letters when moving a cue', () => {
    for (const text of ['😀', 'e\u0301', '👨‍👩‍👦']) {
      const state = stateFor(`${text}正文[#移动]结束`); const cue = narrationCues(state.doc)[0];
      const next = apply(state, moveNarrationCue(state, cue.node.attrs.id, 1)!);
      expect(inlineNarrationSource(next.doc)).toBe(`[#移动]${text}正文结束`);
    }
  });
});
