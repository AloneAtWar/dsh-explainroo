import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo, redo } from 'prosemirror-history';
import { dropCursor } from 'prosemirror-dropcursor';
import { inlineNarration, inlineNarrationSource, moveNarrationCue, narrationSchema, protectNarrationCues, replaceNarrationSelection } from './inline-narration.ts';
import type { Translate } from './copy.ts';

interface Props {
  value: string; disabled: boolean; hidden: boolean; canSave: boolean; renaming: boolean;
  change(value: string): void; seek(name: string): void; context(name: string, x: number, y: number): void; save(): void; t: Translate;
}
export function NarrationEditor(props: Props) {
  const [expanded, setExpanded] = useState(false);
  const mount = useRef<HTMLDivElement>(null); const panel = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null); const current = useRef(props); current.current = props;
  const emitted = useRef(props.value); const dragging = useRef<string | null>(null);
  const dropCaret = useRef<HTMLDivElement | null>(null); const lastDrag = useRef(0);
  useLayoutEffect(() => {
    if (!mount.current) return;
    const editor = new EditorView(mount.current, {
      state: EditorState.create({ schema: narrationSchema, doc: inlineNarration(current.current.value), plugins: [history(), dropCursor({ color: 'var(--er-amber)', width: 3 })] }),
      editable: () => !current.current.disabled,
      attributes: { role: 'textbox', 'aria-label': current.current.t('narration'), 'aria-multiline': 'true', spellcheck: 'false', class: 'er-inlineNarration' },
      dispatchTransaction(transaction) {
        const protectedTransaction = protectNarrationCues(editor.state, transaction);
        editor.updateState(editor.state.apply(protectedTransaction));
        if (protectedTransaction.docChanged) {
          emitted.current = inlineNarrationSource(editor.state.doc); current.current.change(emitted.current);
        }
      },
      nodeViews: {
        cue(node) {
          const chip = document.createElement('span');
          const name = node.attrs.name as string | null;
          chip.className = 'er-inlineCue'; chip.contentEditable = 'false'; chip.draggable = !current.current.disabled;
          chip.dataset.cueId = node.attrs.id; chip.setAttribute('role', 'button'); chip.tabIndex = 0;
          chip.setAttribute('aria-label', name ? `${current.current.t('cue')}：${name}` : `${current.current.t('pauseLabel')} ${node.attrs.pause}s`);
          chip.title = current.current.t('inlineCueHint');
          const grip = document.createElement('span'); grip.className = 'er-cueGrip'; grip.textContent = '⠿'; grip.setAttribute('aria-hidden', 'true');
          const label = document.createElement('span'); label.textContent = name ?? `${current.current.t('pauseLabel')} ${node.attrs.pause}s`;
          chip.append(grip, label);
          const context = (x: number, y: number) => { if (name) current.current.context(name, x, y); };
          chip.addEventListener('click', () => { if (name && Date.now() - lastDrag.current > 300) current.current.seek(name); });
          // Desktop may intercept HTML drag-and-drop. Pointer capture keeps cue movement
          // local to this editor, including when the pointer crosses another atom.
          let pointer: { id: number; x: number; y: number; active: boolean; target: number | null } | null = null;
          const clearPointer = () => {
            const old = pointer; pointer = null; chip.classList.remove('is-dragging');
            dropCaret.current?.remove(); dropCaret.current = null;
            if (old && chip.hasPointerCapture(old.id)) chip.releasePointerCapture(old.id);
          };
          chip.addEventListener('pointerdown', event => {
            if (event.button !== 0 || current.current.disabled) return;
            event.preventDefault(); event.stopPropagation();
            pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, active: false, target: null };
            chip.setPointerCapture(event.pointerId);
          });
          chip.addEventListener('pointermove', event => {
            if (!pointer || pointer.id !== event.pointerId || current.current.disabled) return;
            if (!pointer.active && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 4) return;
            pointer.active = true; event.preventDefault(); chip.classList.add('is-dragging');
            const bounds = editor.dom.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
              pointer.target = null; dropCaret.current?.remove(); dropCaret.current = null; return;
            }
            if (event.clientY < bounds.top + 22) editor.dom.scrollTop -= 12;
            else if (event.clientY > bounds.bottom - 22) editor.dom.scrollTop += 12;
            const hit = editor.posAtCoords({ left: event.clientX, top: event.clientY });
            pointer.target = hit?.pos ?? null;
            if (!hit || !mount.current) return;
            const coords = editor.coordsAtPos(hit.pos); const origin = mount.current.getBoundingClientRect();
            const caret = dropCaret.current ?? document.createElement('div');
            caret.className = 'er-cueDropCaret'; caret.style.left = `${coords.left - origin.left}px`; caret.style.top = `${coords.top - origin.top}px`; caret.style.height = `${coords.bottom - coords.top}px`;
            if (!dropCaret.current) mount.current.append(caret); dropCaret.current = caret;
          });
          chip.addEventListener('pointerup', event => {
            if (!pointer || pointer.id !== event.pointerId) return;
            const completed = pointer; clearPointer();
            if (completed.active) {
              lastDrag.current = Date.now();
              if (!current.current.disabled && completed.target !== null) {
                const transaction = moveNarrationCue(editor.state, node.attrs.id, completed.target); if (transaction) editor.dispatch(transaction); editor.focus();
              }
            } else { chip.focus(); if (name) current.current.seek(name); }
          });
          chip.addEventListener('pointercancel', clearPointer);
          chip.addEventListener('lostpointercapture', clearPointer);
          chip.addEventListener('contextmenu', event => { if (!name) return; event.preventDefault(); event.stopPropagation(); context(event.clientX, event.clientY); });
          chip.addEventListener('keydown', event => {
            if ((event.ctrlKey || event.metaKey) && !current.current.disabled && ['z', 'y'].includes(event.key.toLowerCase())) {
              event.preventDefault(); (event.key.toLowerCase() === 'y' || event.shiftKey ? redo : undo)(editor.state, editor.dispatch);
            }
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const rect = chip.getBoundingClientRect(); context(rect.left, rect.bottom); }
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (name) current.current.seek(name); }
            // Keyboard alternative to drag, one character (or cue) at a time.
            if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key) && !current.current.disabled) {
              event.preventDefault(); let position: number | undefined;
              editor.state.doc.forEach((item, pos) => { if (item.attrs.id === node.attrs.id) position = pos; });
              if (position !== undefined) {
                const target = event.key === 'ArrowLeft' ? position - 1 : position + 2;
                const transaction = moveNarrationCue(editor.state, node.attrs.id, target); if (transaction) editor.dispatch(transaction);
              }
            }
          });
          chip.addEventListener('dragstart', event => {
            if (current.current.disabled || !event.dataTransfer) { event.preventDefault(); return; }
            dragging.current = node.attrs.id; chip.classList.add('is-dragging');
            event.dataTransfer.setData('application/x-explainroo-cue', node.attrs.id); event.dataTransfer.effectAllowed = 'move'; event.stopPropagation();
          });
          chip.addEventListener('dragend', () => { dragging.current = null; chip.classList.remove('is-dragging'); });
          return { dom: chip, stopEvent: event => event.type === 'contextmenu' || event.type.startsWith('drag') || event.type.startsWith('pointer') || event.type === 'keydown', ignoreMutation: () => true, destroy: clearPointer };
        },
      },
      handleKeyDown(editor, event) {
        if (current.current.disabled || event.isComposing) return false;
        if ((event.ctrlKey || event.metaKey) && !event.altKey) {
          if (event.key.toLowerCase() === 'z') return (event.shiftKey ? redo : undo)(editor.state, editor.dispatch);
          if (event.key.toLowerCase() === 'y') return redo(editor.state, editor.dispatch);
        }
        if (event.key === 'Enter') { editor.dispatch(replaceNarrationSelection(editor.state, '\n')); return true; }
        const { selection } = editor.state;
        if (selection.empty && !event.ctrlKey && !event.metaKey && ['Backspace', 'Delete'].includes(event.key)) {
          const adjacent = event.key === 'Backspace' ? selection.$from.nodeBefore : selection.$from.nodeAfter;
          if (adjacent?.type.name === 'cue') {
            editor.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, selection.from + (event.key === 'Backspace' ? -1 : 1)))); return true;
          }
        }
        return false;
      },
      handlePaste(editor, event) {
        if (current.current.disabled) return true;
        const text = event.clipboardData?.getData('text/plain'); if (text === undefined) return false;
        event.preventDefault(); editor.dispatch(replaceNarrationSelection(editor.state, text)); return true;
      },
      clipboardTextSerializer: slice => slice.content.textBetween(0, slice.content.size, '\n', node => node.type.name === 'hard_break' ? '\n' : ''),
      handleDOMEvents: {
        dragover(_editor, event) { if (dragging.current && !current.current.disabled) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'; return true; } return false; },
        drop(editor, event) {
          if (current.current.disabled) { event.preventDefault(); return true; }
          const position = editor.posAtCoords({ left: event.clientX, top: event.clientY });
          editor.dom.querySelectorAll('.is-dragging').forEach(chip => chip.classList.remove('is-dragging'));
          event.preventDefault();
          if (position && dragging.current) {
            const transaction = moveNarrationCue(editor.state, dragging.current, position.pos);
            dragging.current = null; if (transaction) editor.dispatch(transaction); editor.focus();
          } else if (position && event.dataTransfer?.types.includes('text/plain')) {
            const selected = editor.state.apply(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, position.pos)));
            const transaction = replaceNarrationSelection(selected, event.dataTransfer.getData('text/plain'));
            editor.dispatch(transaction); editor.focus();
          }
          return true;
        },
      },
    });
    view.current = editor;
    return () => { view.current = null; editor.destroy(); dropCaret.current?.remove(); dropCaret.current = null; };
  }, []);
  useLayoutEffect(() => {
    const editor = view.current; if (!editor) return;
    if (props.value !== emitted.current) {
      emitted.current = props.value;
      editor.updateState(EditorState.create({ schema: narrationSchema, doc: inlineNarration(props.value), plugins: editor.state.plugins }));
    }
    editor.setProps({ editable: () => !current.current.disabled });
    editor.dom.setAttribute('aria-disabled', String(props.disabled));
    editor.dom.querySelectorAll<HTMLElement>('[data-cue-id]').forEach(chip => { chip.draggable = !props.disabled; chip.setAttribute('aria-disabled', String(props.disabled)); });
  }, [props.value, props.disabled]);
  useEffect(() => { if (props.renaming) setExpanded(false); }, [props.renaming]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement as HTMLElement | null;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setExpanded(false); }
      if (event.key === 'Tab') {
        const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),[contenteditable=true],[data-cue-id]') ?? [])];
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keyboard, true); view.current?.focus();
    return () => { window.removeEventListener('keydown', keyboard, true); previous?.focus(); };
  }, [expanded]);
  return <div hidden={props.hidden} className={`er-narrationShell${expanded ? ' is-expanded' : ''}`}>
    {expanded && <div className="er-narrationBackdrop" onClick={() => setExpanded(false)}/>}
    <div ref={panel} className="er-narrationEditor" role={expanded ? 'dialog' : 'group'} aria-modal={expanded || undefined} aria-label={props.t('narration')}>
      <div className="er-narrationHeading"><small>{props.t('plainNarration')}</small><button type="button" onClick={() => setExpanded(!expanded)}>{props.t(expanded ? 'collapseEditor' : 'expandEditor')}</button></div>
      <div ref={mount} className="er-inlineNarrationMount"/>
      {expanded && <footer><button type="button" className="er-button er-primary" disabled={props.disabled || !props.canSave} onClick={props.save}>{props.t('save')}</button></footer>}
    </div>
  </div>;
}
