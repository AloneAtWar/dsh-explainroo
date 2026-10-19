import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FolderOpen, Plus, Search, X } from 'lucide-react';
import type { ProjectSummary } from '../shared/types.ts';
import type { Translate } from './copy.ts';

export function ProjectPicker({ projects, current, disabled, choose, create, t }: { projects: ProjectSummary[]; current?: string; disabled: boolean; choose: (id: string) => void; create: () => void; t: Translate }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState('');
  const trigger = useRef<HTMLButtonElement>(null); const dialog = useRef<HTMLDivElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const buttons = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input') ?? [])];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const items = projects.filter(item => `${item.title} ${item.folder}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <>
    <button ref={trigger} className="er-projectTrigger" aria-label={`${t('selectProject')}：${projects.find(item => item.id === current)?.title ?? ''}`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => { setQuery(''); setOpen(true); }}><FolderOpen size={16}/><span>{projects.find(item => item.id === current)?.title ?? t('selectProject')}</span><ChevronDown size={14}/></button>
    {open && <div className="er-projectOverlay" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}><div ref={dialog} role="dialog" aria-modal="true" aria-label={t('selectProject')} className="er-projectDialog">
      <header><h2>{t('projects')}</h2><button className="er-icon" aria-label={t('close')} onClick={close}><X size={18}/></button></header>
      <label className="er-projectSearch"><Search size={16}/><input autoFocus aria-label={t('searchProjects')} placeholder={t('searchProjects')} value={query} onChange={event => setQuery(event.target.value)}/></label>
      <div className="er-projectResults">{items.map(item => <button key={item.id} className={'er-projectRow' + (current === item.id ? ' is-selected' : '')} onClick={() => { close(); choose(item.id); }} aria-pressed={current === item.id}><FolderOpen size={19}/><span><strong>{item.title}</strong><small>{item.folder}</small><small>{item.sceneCount} {t('scenes')}</small></span>{current === item.id && <Check size={17}/>}</button>)}{!items.length && <p>{t('noMatchingProjects')}</p>}</div>
      <footer><button className="er-button er-primary" onClick={() => { close(); create(); }}><Plus size={16}/>{t('newProject')}</button></footer>
    </div></div>}
  </>;
}
