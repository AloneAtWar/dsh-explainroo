import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Settings2, Volume2, X } from 'lucide-react';
import type { ProjectDetail, SetupInfo, VoiceSettings } from '../shared/types.ts';
import type { Translate } from './copy.ts';

export function SettingsDialog({ setup, project, disabled, pickDirectory, close, save, t }: { setup: SetupInfo; project: ProjectDetail | null; disabled: boolean; pickDirectory?: () => Promise<string | null>; close: () => void; save: (value: { libraryRoot: string; engineRoot: string; voice?: VoiceSettings }) => Promise<void>; t: Translate }) {
  const [tab, setTab] = useState<'workspace' | 'voice'>('workspace');
  const [libraryRoot, setLibraryRoot] = useState(setup.libraryRoot); const [engineRoot, setEngineRoot] = useState(setup.engineRoot);
  const [voice, setVoice] = useState<VoiceSettings>(project?.voiceSettings ?? { provider: 'mimo', id: '冰糖' });
  const [voiceEdited, setVoiceEdited] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null); const current = useRef({saving, close}); current.current = {saving, close};
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !current.current.saving) { event.preventDefault(); current.current.close(); }
      if (event.key === 'Tab') {
        const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary') ?? [])].filter(item => item.getClientRects().length);
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, []);
  const voiceChanged = voiceEdited && JSON.stringify(voice) !== JSON.stringify(project?.voiceSettings);
  const changed = libraryRoot !== setup.libraryRoot || engineRoot !== setup.engineRoot || voiceChanged;
  const choose = async (which: 'workspace' | 'engine') => { try { const path = await pickDirectory?.(); if (path) (which === 'workspace' ? setLibraryRoot : setEngineRoot)(path); } catch (cause) { setError(/ENOENT|no such file/i.test(String(cause)) ? t('folderMissing') : (cause instanceof Error ? cause.message : String(cause)).split('\n')[0].slice(0, 160)); } };
  const update = (value: VoiceSettings) => { setVoice(value); setVoiceEdited(true); setError(''); };
  return <div className="er-settingsOverlay"><div ref={dialog} className="er-settingsDialog" role="dialog" aria-modal="true" aria-label={t('workbenchSettings')}>
    <header><h2>{t('workbenchSettings')}</h2><button className="er-icon" aria-label={t('close')} disabled={saving} onClick={close}><X size={18}/></button></header>
    <div className="er-settingsTabs" role="tablist" aria-label={t('settings')}><button role="tab" aria-selected={tab === 'workspace'} onClick={() => setTab('workspace')}><Settings2 size={15}/>{t('workspaceTab')}</button><button role="tab" aria-selected={tab === 'voice'} disabled={!project} onClick={() => setTab('voice')}><Volume2 size={15}/>{t('voiceTab')}</button></div>
    <div className="er-settingsBody"><fieldset disabled={saving || disabled}>
      {tab === 'workspace' ? <><label>{t('library')}<span className="er-pathField"><input aria-label={t('library')} value={libraryRoot} onChange={event => setLibraryRoot(event.target.value)}/>{pickDirectory && <button className="er-icon" aria-label={t('choose')} onClick={() => void choose('workspace')}><FolderOpen size={18}/></button>}</span></label><details><summary>{t('advancedVoice')}</summary><label>{t('engine')}<span className="er-pathField"><input aria-label={t('engine')} value={engineRoot} onChange={event => setEngineRoot(event.target.value)}/>{pickDirectory && <button className="er-icon" aria-label={t('engine')} onClick={() => void choose('engine')}><FolderOpen size={18}/></button>}</span></label></details></> : <>
        <div className="er-settingsProject">{project?.title}</div>
        <label>{t('voiceProvider')}<select aria-label={t('voiceProvider')} value={voice.provider} onChange={event => { const provider = event.target.value as VoiceSettings['provider']; update(project?.voiceSettings?.provider === provider ? project.voiceSettings : provider === 'mimo' ? { provider, id: '冰糖' } : provider === 'kokoro' ? { provider, id: project?.voiceChoices?.[0]?.id ?? '' } : { provider, id: '' }); }}><option value="mimo">MiMo</option><option value="elevenlabs">ElevenLabs</option><option value="kokoro">Kokoro · {t('localVoice')}</option></select></label>
        <label>{t(voice.provider === 'elevenlabs' ? 'voiceId' : 'voiceName')}{voice.provider === 'kokoro' && project?.voiceChoices?.length ? <select aria-label={t('voiceName')} value={voice.id} onChange={event => update({ ...voice, id: event.target.value })}>{project.voiceChoices.map(item => <option key={item.id} value={item.id}>{item.id} · {item.label}</option>)}</select> : <input aria-label={t(voice.provider === 'elevenlabs' ? 'voiceId' : 'voiceName')} value={voice.id} maxLength={200} onChange={event => update({ ...voice, id: event.target.value })}/>}</label>
        {voice.provider !== 'kokoro' && <details><summary>{t('advancedVoice')}</summary><label>{t('voiceModel')}<input aria-label={t('voiceModel')} value={voice.model ?? ''} placeholder={voice.provider === 'mimo' ? 'mimo-v2.5-tts' : 'eleven_multilingual_v2'} onChange={event => update({ ...voice, model: event.target.value || undefined })}/></label>{voice.provider === 'mimo' && <><label>{t('voiceStyle')}<textarea aria-label={t('voiceStyle')} value={voice.style ?? ''} maxLength={500} onChange={event => update({ ...voice, style: event.target.value })}/></label><label>{t('voiceHost')}<input aria-label={t('voiceHost')} value={voice.host ?? ''} placeholder="api.xiaomimimo.com" onChange={event => update({ ...voice, host: event.target.value || undefined })}/></label></>}</details>}
      </>}
    </fieldset>{error && <div role="alert" className="er-settingsError">{error}</div>}</div>
    <footer><button className="er-button" disabled={saving} onClick={close}>{t('cancelSettings')}</button><button className="er-button er-primary" disabled={!changed || disabled || saving || !libraryRoot.trim() || (voiceChanged && !voice.id.trim())} onClick={() => { setSaving(true); setError(''); void save({ libraryRoot, engineRoot, ...(voiceChanged ? { voice } : {}) }).catch(cause => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setSaving(false)); }}>{t(saving ? 'saving' : 'apply')}</button></footer>
  </div></div>;
}
