import { Fragment, Schema, Slice, type Node as EditorNode } from 'prosemirror-model';
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { closeHistory } from 'prosemirror-history';
import { narrationParts } from './narration.ts';

// Cues are atomic inline objects. Their identity is local to this editor instance.
export const narrationSchema = new Schema({ nodes: {
  doc: { content: 'inline*' },
  text: { group: 'inline' },
  cue: {
    group: 'inline', inline: true, atom: true, selectable: true, draggable: true,
    attrs: { id: {}, token: {}, name: { default: null }, pause: { default: null } },
    toDOM: node => ['span', { 'data-cue-id': node.attrs.id, contenteditable: 'false', class: 'er-inlineCue' }, node.attrs.name ?? `${node.attrs.pause}s`],
    leafText: () => '',
  },
  hard_break: {
    group: 'inline', inline: true, selectable: false, attrs: { eol: { default: '\n' } },
    parseDOM: [{ tag: 'br' }], toDOM: () => ['br'], leafText: () => '\n',
  },
} });

export function narrationTextNodes(text: string): EditorNode[] {
  const nodes: EditorNode[] = []; let cursor = 0;
  for (const match of text.matchAll(/\r\n|\r|\n/g)) {
    if (match.index! > cursor) nodes.push(narrationSchema.text(text.slice(cursor, match.index)));
    nodes.push(narrationSchema.nodes.hard_break.create({ eol: match[0] })); cursor = match.index! + match[0].length;
  }
  if (cursor < text.length) nodes.push(narrationSchema.text(text.slice(cursor)));
  return nodes;
}
export function inlineNarration(raw: string): EditorNode {
  const nodes: EditorNode[] = []; let index = 0;
  for (const part of narrationParts(raw)) {
    if (part.token) nodes.push(narrationSchema.nodes.cue.create({ id: `cue-${index++}`, token: part.token, name: part.marker ?? null, pause: part.pause ?? null }));
    nodes.push(...narrationTextNodes(part.text));
  }
  return narrationSchema.nodes.doc.create(null, nodes);
}
export function inlineNarrationSource(doc: EditorNode): string {
  let raw = '';
  doc.forEach(node => { raw += node.isText ? node.text : node.type.name === 'cue' ? node.attrs.token : node.attrs.eol; });
  return raw;
}
export function narrationCues(doc: EditorNode): { node: EditorNode; pos: number }[] {
  const cues: { node: EditorNode; pos: number }[] = [];
  doc.forEach((node, pos) => { if (node.type.name === 'cue') cues.push({ node, pos }); }); return cues;
}

/** Text replacement, cut and deletion may remove words, but never remove or duplicate a cue. */
export function protectNarrationCues(state: EditorState, transaction: Transaction): Transaction {
  if (!transaction.docChanged) return transaction;
  const original = narrationCues(state.doc); const expected = new Map(original.map(cue => [cue.node.attrs.id, cue]));
  const seen = new Set<string>(); const remove: number[] = [];
  for (const cue of narrationCues(transaction.doc)) {
    if (!expected.has(cue.node.attrs.id) || seen.has(cue.node.attrs.id)) remove.push(cue.pos);
    else seen.add(cue.node.attrs.id);
  }
  for (const pos of remove.reverse()) transaction.delete(pos, pos + 1);
  const missing = original.filter(cue => !seen.has(cue.node.attrs.id)).map((cue, order) => ({ ...cue, order, target: transaction.mapping.map(cue.pos, -1) }));
  // Inserting from right to left preserves the order of adjacent protected objects.
  missing.sort((a, b) => b.target - a.target || b.order - a.order);
  for (const cue of missing) transaction.insert(Math.max(0, Math.min(transaction.doc.content.size, cue.target)), cue.node);
  return transaction;
}
export function replaceNarrationSelection(state: EditorState, text: string): Transaction {
  return protectNarrationCues(state, state.tr.replaceSelection(new Slice(Fragment.from(narrationTextNodes(text)), 0, 0)));
}
export function moveNarrationCue(state: EditorState, id: string, target: number): Transaction | null {
  // A drop or keyboard move must not split an emoji or a combining character.
  state.doc.forEach((node, pos) => {
    if (!node.isText || target <= pos || target >= pos + node.nodeSize) return;
    const offset = target - pos;
    for (const segment of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(node.text!)) {
      if (offset > segment.index && offset < segment.index + segment.segment.length) { target = pos + segment.index; break; }
    }
  });
  const cue = narrationCues(state.doc).find(item => item.node.attrs.id === id);
  if (!cue || target < 0 || target > state.doc.content.size || target === cue.pos || target === cue.pos + 1) return null;
  const transaction = closeHistory(state.tr).delete(cue.pos, cue.pos + 1);
  const position = transaction.mapping.map(target, -1);
  transaction.insert(position, cue.node).setSelection(TextSelection.create(transaction.doc, position + 1));
  return transaction;
}
