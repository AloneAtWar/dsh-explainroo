import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Translate } from './copy.ts';
export function RenameDialog({ kind, from, save, close, t }: { kind: 'scene' | 'marker'; from: string; save(to: string): Promise<void>; close(): void; t: Translate }) {
  const [value, setValue] = useState(from); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null); const dialog = useRef<HTMLFormElement>(null); const current = useRef({ saving, close }); current.current = { saving, close };
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; input.current?.focus(); input.current?.select(); const keyboard = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !current.current.saving) current.current.close();
    if (event.key === 'Tab') { const items=[...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') ?? [])]; if (event.shiftKey && document.activeElement===items[0]) {event.preventDefault();items.at(-1)?.focus();} else if (!event.shiftKey && document.activeElement===items.at(-1)) {event.preventDefault();items[0]?.focus();} }
  }; document.addEventListener('keydown', keyboard); return () => { document.removeEventListener('keydown', keyboard); previous?.focus(); }; }, []);
  return <div className="er-settingsOverlay"><form ref={dialog} className="er-settingsDialog er-renameDialog" role="dialog" aria-modal="true" aria-label={t(kind === 'scene' ? 'renameScene' : 'renameMarker')} onSubmit={event => { event.preventDefault(); if (saving || !value.trim() || value.trim() === from) return; setSaving(true); setError(''); void save(value.trim()).catch(cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setSaving(false)); }}>
    <header><h2>{t(kind === 'scene' ? 'renameScene' : 'renameMarker')}</h2><button type="button" className="er-icon" aria-label={t('close')} disabled={saving} onClick={close}><X size={18}/></button></header>
    <div className="er-settingsBody"><label>{t('name')}<input ref={input} aria-label={t('name')} value={value} disabled={saving} maxLength={80} onChange={event => setValue(event.target.value)}/></label>{error && <div role="alert" className="er-settingsError">{error}</div>}</div>
    <footer><button type="button" className="er-button" disabled={saving} onClick={close}>{t('cancelSettings')}</button><button type="submit" className="er-button er-primary" disabled={saving || !value.trim() || value.trim() === from}>{t(saving ? 'saving' : 'save')}</button></footer>
  </form></div>;
}
