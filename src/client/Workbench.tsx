import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clapperboard, Copy, Download, FolderOpen, Image, LockKeyhole, MessageSquare, Moon, Pause, Pencil, Play, Redo2, RefreshCw, Save, Settings2, Sun, Undo2, X } from 'lucide-react';
import type { Appearance, EditableElement, ElementPatch, NewProjectRequest, ProjectDetail, SetupInfo, TaskAction, TaskInfo, WorkbenchApi } from '../shared/types.ts';
import type { SceneSelection } from './scene-references.ts';
import { themes, textures } from '../shared/types.ts';
import { zh, type Translate } from './copy.ts';
import css from './workbench.css?inline';
import workspaceCss from './workspace-ui.css?inline';
import { ProjectPicker } from './ProjectPicker.tsx';
import { SettingsDialog } from './SettingsDialog.tsx';
import { ExplainrooIcon } from './ExplainrooIcon.tsx';
import { referencePrompt, markerReferencePrompt, type ReferenceKind } from './reference-prompt.ts';
import { RenameDialog } from './RenameDialog.tsx';
import { NarrationEditor } from './InlineNarrationEditor.tsx';

export interface WorkbenchProps { api: WorkbenchApi; pickDirectory?: () => Promise<string | null>; openConversation?: (project: ProjectDetail) => Promise<boolean>; restoreFolder?: string | null; onContextChange?: (selection: SceneSelection | null) => void; t?: Translate }
const formatTime = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${(Math.max(0, seconds) % 60).toFixed(1).padStart(4, '0')}`;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
interface FrameState { time: number; playing: boolean; sceneId: string; elements: EditableElement[]; selected: string | null }
const initialFrame: FrameState = { time: 0, playing: false, sceneId: '', elements: [], selected: null };

export function Workbench({ api, pickDirectory, openConversation, restoreFolder, onContextChange, t = key => zh[key] }: WorkbenchProps) {
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [selectedScene, setSelectedScene] = useState('');
  const [frame, setFrame] = useState(initialFrame);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [raw, setRaw] = useState(''); const [note, setNote] = useState('');
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [elementPatch, setElementPatch] = useState<ElementPatch>({});
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 3200); return () => window.clearTimeout(timer); }, [notice]);
  const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(false);
  const [renaming, setRenaming] = useState<{ kind: 'scene' | 'marker'; from: string; sceneId: string; revision: string; projectId: string } | null>(null);
  const [libraryPath, setLibraryPath] = useState(''); const [enginePath, setEnginePath] = useState('');
  const [newTitle, setNewTitle] = useState(''); const [newSize, setNewSize] = useState<NewProjectRequest['size']>('youtube'); const [newTheme, setNewTheme] = useState<NewProjectRequest['theme']>('paper');
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const pendingExports = useRef(new Set<string>()); const handledExports = useRef(new Set<string>());
  const [startingExport, setStartingExport] = useState(false); const [readyExport, setReadyExport] = useState<TaskInfo | null>(null);
  useEffect(() => { setReadyExport(tasks.find(task => task.status === 'completed' && !!task.output && ['render', 'sheet'].includes(task.action) && task.projectFolder === project?.folder) ?? null); }, [tasks, project?.folder]);
  const [creating, setCreating] = useState(false); const [newDirectory, setNewDirectory] = useState('');
  const [uiTheme, setUiTheme] = useState<'light' | 'dark'>(() => { try { return localStorage.getItem('dsh-explainroo:ui-theme:v1') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; text: string; label: string; sceneId: string; kind: ReferenceKind | 'marker'; marker?: string } | null>(null);
  const [copyFallback, setCopyFallback] = useState(''); const workbenchRoot = useRef<HTMLElement>(null); const menuRoot = useRef<HTMLDivElement>(null);
  const [openingConversation, setOpeningConversation] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#0b1020');
  const iframe = useRef<HTMLIFrameElement>(null);
  const channel = useRef(crypto.randomUUID());
  const navigation = useRef(0);
  const restoredFolder = useRef<string | null>(null);
  const latest = useRef({ project, selectedScene, frame, raw, note, elementPatch, saving });
  latest.current = { project, selectedScene, frame, raw, note, elementPatch, saving };
  const scene = project?.scenes.find(item => item.id === selectedScene);
  const edit = project?.studio.scenes[selectedScene];
  const selectedElement = frame.elements.find(item => item.id === frame.selected);
  const dirtyScript = !!scene && (raw !== scene.raw || note !== (edit?.note ?? ''));
  const dirtyElement = Object.keys(elementPatch).length > 0;
  const dirty = dirtyScript || dirtyElement;
  const activeTask = tasks.find(task => task.status === 'running' && task.projectId === project?.id);
  const displayTask = activeTask ?? tasks.find(task => task.status === 'running' && ['render', 'sheet'].includes(task.action));
  const busy = saving || startingExport || !!activeTask;
  const emptyFolder = creating;
  useEffect(() => { if (setup?.folderState?.kind === 'empty' && !project) setNewTitle(setup.folderState.folder.split(/[\\/]/).pop() ?? ''); }, [setup?.folderState?.folder, project?.id]);
  useEffect(() => { onContextChange?.(project && !loading ? { id: project.id, folder: project.folder, ...(selectedScene ? { sceneId: selectedScene } : {}), ...(selectedElement ? { element: { id: selectedElement.id, kind: selectedElement.kind, baseText: selectedElement.baseText } } : {}) } : null); }, [project?.id, project?.folder, selectedScene, selectedElement?.id, selectedElement?.kind, selectedElement?.baseText, loading, onContextChange]);
  useEffect(() => () => onContextChange?.(null), [onContextChange]);
  useEffect(() => { if (project) setBackgroundColor(project.appearance.bg); }, [project?.id, project?.appearance.bg]);
  const send = useCallback((type: string, data?: unknown) => {
    const current = latest.current.project;
    if (!current?.previewUrl) return;
    iframe.current?.contentWindow?.postMessage({ source: 'explainroo-workbench', channel: channel.current, type, data }, new URL(current.previewUrl).origin);
  }, []);
  function toggleUiTheme() { const next = uiTheme === 'light' ? 'dark' : 'light'; setUiTheme(next); try { localStorage.setItem('dsh-explainroo:ui-theme:v1', next); } catch { /* keep the session preference */ } }
  function showReference(x: number, y: number, targetProject: ProjectDetail, sceneId: string, kind: ReferenceKind, element?: EditableElement) {
    const rect = workbenchRoot.current?.getBoundingClientRect(); if (!rect) return;
    try { setContextMenu({ x: Math.max(8, Math.min(x - rect.left, rect.width - 270)), y: Math.max(8, Math.min(y - rect.top, Math.min(rect.bottom, window.innerHeight) - rect.top - 110)), text: referencePrompt(targetProject, sceneId, kind, element, setup?.libraryRoot), label: t(kind === 'scene' ? 'copySceneRef' : kind === 'element' ? 'copyElementRef' : 'copyVisualRef'), sceneId, kind }); }
    catch (cause) { setError(message(cause)); }
  }
  function context(event: React.MouseEvent, sceneId: string, kind: ReferenceKind, element?: EditableElement) { if (!project) return; event.preventDefault(); event.stopPropagation(); showReference(event.clientX, event.clientY, project, sceneId, kind, element); }
  function markerContext(name: string, x: number, y: number) {
    if (!project || !scene) return; const rect = workbenchRoot.current?.getBoundingClientRect(); if (!rect) return;
    try { setContextMenu({ x: Math.max(8, Math.min(x - rect.left, rect.width - 270)), y: Math.max(8, Math.min(y - rect.top, Math.min(rect.bottom, window.innerHeight) - rect.top - 110)), text: markerReferencePrompt(project, scene.id, name, setup?.libraryRoot, raw), label: t('copyMarkerRef'), sceneId: scene.id, kind: 'marker', marker: name }); }
    catch (cause) { setError(message(cause)); }
  }
  async function copyReference() {
    if (!contextMenu) return; const value = contextMenu.text; setContextMenu(null);
    try { await navigator.clipboard.writeText(value); setNotice(t('referenceCopied')); } catch { setCopyFallback(value); }
  }
  useEffect(() => { setContextMenu(null); }, [project?.folder]);
  useEffect(() => {
    if (!contextMenu) return;
    const close = (event: PointerEvent) => { if (!menuRoot.current?.contains(event.target as Node)) setContextMenu(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setContextMenu(null); };
    document.addEventListener('pointerdown', close, true); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', escape); };
  }, [contextMenu]);
  const accept = useCallback((next: ProjectDetail, selected?: string) => {
    setProject(next);
    const id = selected ?? latest.current.selectedScene;
    const nextScene = next.scenes.find(item => item.id === id) ?? next.scenes[0];
    setSelectedScene(nextScene?.id ?? ''); setRaw(nextScene?.raw ?? ''); setNote(next.studio.scenes[nextScene?.id ?? '']?.note ?? '');
    setElementPatch({}); setEditorEpoch(value => value + 1); setError('');
  }, []);
  async function load(id: string) {
    if (dirty) { setError(t('dirtyHint')); return; }
    setLoading(true); setError(''); const generation = ++navigation.current;
    try { const next = await api.project({ id }); if (generation !== navigation.current) return; accept(next, next.scenes[0]?.id); setThumbs({}); setFrame(initialFrame); }
    catch (cause) { if (generation === navigation.current) setError(message(cause)); } finally { if (generation === navigation.current) setLoading(false); }
  }
  useEffect(() => { const tag = document.createElement('style'); tag.dataset.explainroo = 'workbench'; tag.textContent = css + workspaceCss; document.head.appendChild(tag); return () => tag.remove(); }, []);
  useEffect(() => { let alive = true; const generation = ++navigation.current; void api.setup().then(next => { if (!alive || generation !== navigation.current) return; setSetup(next); setLibraryPath(next.libraryRoot); setEnginePath(next.engineRoot); if (next.engineReady && next.projects.length) void load(next.projects[0].id); }).catch(cause => { if (alive && generation === navigation.current) setError(message(cause)); }); return () => { alive = false; }; }, [api]);
  useEffect(() => {
    if (!restoreFolder) { restoredFolder.current = null; return; }
    if (restoredFolder.current === restoreFolder) return;
    if (restoreFolder === latest.current.project?.folder) { restoredFolder.current = restoreFolder; return; }
    if (dirty) { setError(t('dirtyHint')); return; }
    let alive = true; const generation = ++navigation.current;
    setLoading(true);
    void api.setup().then(async available => {
      if (!alive || generation !== navigation.current) return;
      const next = (available.libraryRoot === restoreFolder || available.projects.some(item => item.folder === restoreFolder)) ? available : await api.configure({ libraryRoot: restoreFolder });
      if (!alive || generation !== navigation.current) return;
      setSetup(next); setLibraryPath(next.libraryRoot);
      const target = next.projects.find(item => item.folder === latest.current.project?.folder) ?? next.projects.find(item => item.folder === restoreFolder) ?? next.projects[0];
      restoredFolder.current = restoreFolder;
      if (target) { const detail = await api.project({ id: target.id }); if (alive && generation === navigation.current) { accept(detail, detail.scenes[0]?.id); setThumbs({}); setFrame(initialFrame); restoredFolder.current = restoreFolder; } }
    }).catch(cause => { if (alive) setError(message(cause)); }).finally(() => { if (alive && generation === navigation.current) setLoading(false); });
    return () => { alive = false; };
  }, [restoreFolder, api, accept, dirty]);
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const current = latest.current;
      if (event.source !== iframe.current?.contentWindow || event.data?.source !== 'explainroo-frame' || event.data.channel !== channel.current || !current.project || event.origin !== new URL(current.project.previewUrl).origin) return;
      const { type, data } = event.data;
      if (type === 'ready') {
        send('state', current.project.studio);
        const currentScene = current.project.scenes.find(item => item.id === current.selectedScene);
        if (currentScene && current.frame.time === 0) send('seek', currentScene.start + Math.min(currentScene.duration * 0.7, Math.max(0, currentScene.duration - 0.1)));
      }
      if (type === 'thumbnails') setThumbs(data);
      if (type === 'frame') {
        setFrame(data);
        if (data.sceneId && data.sceneId !== current.selectedScene && !current.saving) {
          const target = current.project.scenes.find(item => item.id === data.sceneId);
          if (target && current.raw === current.project.scenes.find(item => item.id === current.selectedScene)?.raw && current.note === (current.project.studio.scenes[current.selectedScene]?.note ?? '') && !Object.keys(current.elementPatch).length) {
            setSelectedScene(target.id); setRaw(target.raw); setNote(current.project.studio.scenes[target.id]?.note ?? ''); setElementPatch({});
          }
        }
        if (data.selected !== current.frame.selected) setElementPatch({});
      }
      if (type === 'error') setError(String(data));
      if (type === 'context' && typeof data.sceneId === 'string' && current.project.scenes.some(item => item.id === data.sceneId) && Number.isFinite(data.x) && Number.isFinite(data.y)) {
        const bounds = iframe.current?.getBoundingClientRect();
        if (bounds) showReference(bounds.left + data.x, bounds.top + data.y, current.project, data.sceneId, data.element?.id && data.element?.kind ? 'element' : 'visual', data.element);
      }
      if (type === 'edit' && !current.saving && current.raw === current.project.scenes.find(item => item.id === current.selectedScene)?.raw && current.note === (current.project.studio.scenes[current.selectedScene]?.note ?? '') && !Object.keys(current.elementPatch).length) {
        setSaving(true);
        void api.save({ id: current.project.id, revision: current.project.revision, ...data, origin: 'user' }).then(next => accept(next, data.sceneId)).catch(cause => { setError(message(cause)); send('state', current.project!.studio); }).finally(() => setSaving(false));
      }
    };
    window.addEventListener('message', listener); return () => window.removeEventListener('message', listener);
  }, [api, accept, send, setup?.libraryRoot]);
  async function refreshTasks() { try { setTasks(await api.tasks({ id: '*' })); } catch (cause) { setError(message(cause)); } }
  useEffect(() => { void refreshTasks(); const timer = setInterval(() => void refreshTasks(), 2500); return () => clearInterval(timer); }, [api]);
  useEffect(() => {
    if (!project) return;
    let disposed = false;
    const interval = setInterval(() => {
      const current = latest.current;
      const currentScene = current.project?.scenes.find(item => item.id === current.selectedScene);
      if (current.saving || current.raw !== (currentScene?.raw ?? '') || current.note !== (current.project?.studio.scenes[current.selectedScene]?.note ?? '') || Object.keys(current.elementPatch).length) return;
      const expectedFolder = current.project?.folder;
      void api.project({ id: project.id }).then(next => { const now = latest.current; const stillClean = now.raw === (now.project?.scenes.find(item => item.id === now.selectedScene)?.raw ?? '') && now.note === (now.project?.studio.scenes[now.selectedScene]?.note ?? '') && !Object.keys(now.elementPatch).length && !now.saving; if (!disposed && next.folder === expectedFolder && now.project?.folder === expectedFolder && stillClean && next.revision !== now.project.revision) accept(next); }).catch(cause => { if (!disposed) setError(message(cause)); });
    }, 2500);
    return () => { disposed = true; clearInterval(interval); };
  }, [project?.id, api, accept]);
  useEffect(() => { if (project) send('state', project.studio); }, [project?.revision, send]);
  function chooseScene(id: string) {
    if (!project || dirty) { if (dirty) setError(t('dirtyHint')); return; }
    const target = project.scenes.find(item => item.id === id); if (!target) return;
    setSelectedScene(id); setRaw(target.raw); setNote(project.studio.scenes[id]?.note ?? ''); setElementPatch({}); send('seek', target.start + target.duration * 0.7); send('select', null);
  }
  async function save() {
    if (!project || !scene) return; setSaving(true);
    try {
      const element = selectedElement && dirtyElement ? { kind: selectedElement.kind, baseText: selectedElement.baseText, patch: { ...edit?.elements[selectedElement.id]?.patch, ...elementPatch } } : undefined;
      accept(await api.save({ id: project.id, sceneId: scene.id, revision: project.revision, ...(dirtyScript ? { raw, note } : {}), ...(element ? { elementId: selectedElement!.id, element } : {}), origin: 'user' }));
      setNotice(t('saved'));
    } catch (cause) { setError(message(cause)); } finally { setSaving(false); }
  }
  function updateElement(patch: ElementPatch) {
    if (!project || !selectedElement || edit?.locked) return;
    const next = { ...elementPatch, ...patch }; setElementPatch(next);
    const studio = structuredClone(project.studio);
    const sceneEdit = studio.scenes[selectedScene] ??= { locked: false, note: '', elements: {} };
    sceneEdit.elements[selectedElement.id] = { kind: selectedElement.kind, baseText: selectedElement.baseText, patch: { ...edit?.elements[selectedElement.id]?.patch, ...next } };
    send('state', studio);
  }
  function discard() { if (!project || !scene) return; setRaw(scene.raw); setNote(edit?.note ?? ''); setEditorEpoch(value => value + 1); setElementPatch({}); send('state', project.studio); }
  async function undo(direction: 'undo' | 'redo') {
    if (!project || dirty) { if (dirty) setError(t('dirtyHint')); return; } setSaving(true);
    try { accept(await api.history({ id: project.id, revision: project.revision, direction })); } catch (cause) { setError(message(cause)); } finally { setSaving(false); }
  }
  async function changeAppearance(appearance: Appearance) {
    if (!project || busy || dirty) return;
    setSaving(true);
    try { accept(await api.appearance({ id: project.id, revision: project.revision, appearance })); setThumbs({}); }
    catch (cause) { setError(message(cause)); } finally { setSaving(false); }
  }
  async function run(action: TaskAction) {
    if (!project || dirty) { if (dirty) setError(t('dirtyHint')); return; }
    if (busy) return; setStartingExport(true); setError(''); try { const task = await api.task({ id: project.id, action }); pendingExports.current.add(task.id); setTasks(previous => [task, ...previous]); } catch (cause) { setError(message(cause).split('\n')[0].slice(0, 160)); } finally { setStartingExport(false); }
  }
  async function configure() {
    if (dirty) { setError(t('dirtyHint')); return; }
    setLoading(true); setError('');
    try {
      const inspected = await api.inspectFolder({ folder: libraryPath });
      setLibraryPath(inspected.folder);
      const next = await api.configure({ libraryRoot: inspected.folder, engineRoot: enginePath }); setSetup(next); setProject(null); setSettings(false);
      const target = next.projects.find(item => item.folder === project?.folder) ?? next.projects[0];
      if (target && next.engineReady) { accept(await api.project({ id: target.id }), ''); setThumbs({}); setFrame(initialFrame); }
    } catch (cause) { setError(message(cause)); } finally { setLoading(false); }
  }
  async function chooseFolder(which: 'library' | 'engine') {
    if (!pickDirectory) return;
    try { const result = await pickDirectory(); if (result) { if (which === 'library') { setLibraryPath(result); const inspected = await api.inspectFolder({ folder: result }); setLibraryPath(inspected.folder); if (inspected.kind === 'empty') setNewTitle(inspected.folder.split(/[\\/]/).pop() ?? ''); } else setEnginePath(result); setSettings(true); } } catch (cause) { setError(message(cause)); }
  }
  async function initializeProject() {
    if (!creating || dirty || busy || loading) return;
    setLoading(true); setError('');
    try {
      if (enginePath !== setup?.engineRoot) await api.configure({ engineRoot: enginePath });
      const result = await api.createProject({ folder: setup?.libraryRoot ?? libraryPath, directory: newDirectory, title: newTitle.trim(), theme: newTheme, size: newSize });
      ++navigation.current; setSetup(result.setup); setLibraryPath(result.setup.libraryRoot); setEnginePath(result.setup.engineRoot);
      accept(result.project, ''); setThumbs({}); setFrame(initialFrame); setSettings(false); setCreating(false); setNotice(t('projectInitialized'));
    } catch (cause) { setError(message(cause)); } finally { setLoading(false); }
  }
  async function openProjectConversation() {
    if (!project || !openConversation || openingConversation || dirty) return;
    setOpeningConversation(true); setError('');
    try { await openConversation(project); } catch (cause) { setError(message(cause)); }
    finally { setOpeningConversation(false); }
  }
  const elementValue = <K extends keyof ElementPatch>(key: K, fallback: any) => elementPatch[key] ?? fallback;
  function beginRename(kind: 'scene' | 'marker', from: string, sceneId = selectedScene) { if (!project || !project.scenes.some(item => item.id === sceneId) || busy || dirty || project.studio.scenes[sceneId]?.locked) { if (dirty) setError(t('dirtyHint')); return; } if (frame.playing) send('play'); setRenaming({kind, from, sceneId, revision: project.revision, projectId: project.id}); }

  function startProject() { if (!setup?.folderState) { setSettings(true); return; } setNewTitle(''); setNewDirectory(`video-${Date.now().toString(36)}`); setLibraryPath(setup?.libraryRoot ?? ''); setError(''); setNotice(''); setCreating(true); setSettings(false); }
  async function saveExport(task: TaskInfo) { const value = await api.download({ taskId: task.id }); const link = document.createElement('a'); link.href = value.url; link.download = value.filename; document.body.appendChild(link); link.click(); link.remove(); }
  useEffect(() => { for (const task of tasks) { if (!pendingExports.current.has(task.id) || handledExports.current.has(task.id) || task.status === 'running') continue; handledExports.current.add(task.id); pendingExports.current.delete(task.id); if (task.status === 'completed') { setReadyExport(task); void saveExport(task).catch(cause => setError(message(cause).split('\n')[0].slice(0, 160))); } else if (task.status === 'failed') setError((task.error ?? t('exportFailed')).split('\n')[0].slice(0, 160)); } }, [tasks]);
  return <section ref={workbenchRoot} className="er-workbench" data-ui-theme={uiTheme} aria-label={t('title')}>
    <header className="er-topbar">
      <div className="er-brand"><ExplainrooIcon/><strong>explainroo</strong></div>
      <ProjectPicker projects={setup?.projects ?? []} current={project?.id} disabled={dirty || loading || saving || openingConversation} choose={id => { setSettings(false); setCreating(false); void load(id); }} create={startProject} t={t}/>
      {!settings && project && <span className={'er-saveStatus' + (dirty ? ' is-dirty' : '')}>{saving ? t('saving') : dirty ? t('unsaved') : <><Check size={13}/>{t('saved')}</>}</span>}
      <div className="er-topActions">

        <button className="er-icon" aria-label={t('undo')} disabled={settings || busy || !project?.canUndo || dirty} onClick={() => void undo('undo')}><Undo2 size={17}/></button>
        <button className="er-icon" aria-label={t('redo')} disabled={settings || busy || !project?.canRedo || dirty} onClick={() => void undo('redo')}><Redo2 size={17}/></button>
        <button className="er-icon" aria-label={t('refresh')} disabled={settings || busy || !project} onClick={() => project && void load(project.id)}><RefreshCw size={17}/></button>
        <button className="er-icon" aria-label={t(uiTheme === 'light' ? 'darkMode' : 'lightMode')} title={t(uiTheme === 'light' ? 'darkMode' : 'lightMode')} onClick={toggleUiTheme}>{uiTheme === 'light' ? <Moon size={17}/> : <Sun size={17}/>}</button>
        <button className="er-icon" aria-label={t('settings')} onClick={() => { setCreating(false); setLibraryPath(setup?.libraryRoot ?? libraryPath); setSettings(!settings); }}><Settings2 size={17}/></button>
        <div className="er-exportStatusSlot">{(displayTask || startingExport) && <div className="er-exportProgress" role="status"><span>{t(displayTask?.phase === 'voice' ? 'voiceProgress' : displayTask?.phase === 'sheet' ? 'sheetProgress' : displayTask?.phase === 'render' ? 'renderProgress' : 'preparingExport')}</span><progress max="100" value={displayTask?.progress ?? 0}/><strong>{displayTask?.progress ?? 0}%</strong>{displayTask && <button className="er-icon" aria-label={t('cancel')} onClick={() => void api.cancel({taskId: displayTask.id}).then(refreshTasks)}><X size={13}/></button>}</div>}
        {!displayTask && readyExport?.projectFolder === project?.folder && readyExport && <button className="er-button er-small" onClick={() => void saveExport(readyExport).catch(cause => setError(message(cause)))}>{t('saveExport')}</button>}</div>
        <button className="er-button" disabled={creating || !project?.sceneCount || busy || dirty} onClick={() => void run('sheet')}><Image size={16}/>{t('sheet')}</button>
        <button className="er-button er-primary" disabled={creating || !project?.sceneCount || busy || dirty} onClick={() => void run('render')}><Download size={16}/>{t('render')}</button>
      </div>
    </header>
    {error && <div className="er-toast er-toastError" role="alert">{error}<button className="er-icon" aria-label={t('close')} onClick={() => setError('')}><X size={15}/></button></div>}
    {notice && <div className="er-toast" role="status">{notice}<button className="er-icon" aria-label={t('close')} onClick={() => setNotice('')}><X size={15}/></button></div>}
    <div className="er-editorSurface">
    {project && !creating && <div className="er-appearance" role="group" aria-label={t('appearance')}>
      <strong><Settings2 size={15}/>{t('appearance')}</strong>
      <label>{t('theme')}<select aria-label={t('theme')} value={project.appearance.theme} disabled={busy || dirty} onChange={event => void changeAppearance({ theme: event.target.value as Appearance['theme'], ...(project.studio.appearance?.captions !== undefined ? { captions: project.studio.appearance.captions } : {}) })}>{themes.map(theme => <option key={theme} value={theme}>{t(theme)}</option>)}</select></label>
      <label className="er-backgroundField">{t('backgroundColor')}<span><input type="color" aria-label={t('pickColor')} value={/^#[\da-f]{6}$/i.test(backgroundColor) ? backgroundColor : project.appearance.bg} disabled={busy || dirty} onChange={event => setBackgroundColor(event.target.value)}/><input className="er-hex" aria-label={t('backgroundColor')} value={backgroundColor} maxLength={7} disabled={busy || dirty} onChange={event => setBackgroundColor(event.target.value)}/><button className="er-button er-small" disabled={busy || dirty || backgroundColor === project.appearance.bg || !/^#[\da-f]{6}$/i.test(backgroundColor)} onClick={() => void changeAppearance({ ...project.studio.appearance, bg: backgroundColor })}>{t('applyColor')}</button></span></label>
      <label>{t('texture')}<select aria-label={t('texture')} value={project.appearance.background} disabled={busy || dirty} onChange={event => void changeAppearance({ ...project.studio.appearance, background: event.target.value as Appearance['background'] })}>{textures.map(texture => <option key={texture} value={texture}>{t(`texture_${texture}`)}</option>)}</select></label>
      <label className="er-captionToggle"><input type="checkbox" checked={project.appearance.captions} disabled={busy || dirty} onChange={event => void changeAppearance({ ...project.studio.appearance, captions: event.target.checked })}/>{t('captions')}</label>
      <button className="er-button er-small er-quiet" disabled={busy || dirty || !project.appearance.custom} onClick={() => void changeAppearance({})}>{t('resetAppearance')}</button>
    </div>}
    {creating || !setup?.engineReady || !setup?.folderState ? <div className="er-onboarding er-projectSetup" aria-busy={loading}>
      <Clapperboard size={38}/><h1>{t(creating ? 'newProject' : 'workbenchSettings')}</h1>
      <fieldset disabled={loading || busy} className="er-setupFields">
      <label>{t('library')}<span className="er-pathField"><input aria-label={t('library')} value={libraryPath} disabled={creating} onChange={event => setLibraryPath(event.target.value)}/>{pickDirectory && !creating && <button className="er-icon" aria-label={t('choose')} onClick={() => void chooseFolder('library')}><FolderOpen size={18}/></button>}</span></label>
      {emptyFolder ? <>
        <label>{t('projectName')}<input aria-label={t('projectName')} value={newTitle} maxLength={120} onChange={event => setNewTitle(event.target.value)}/></label>
        <label>{t('projectDirectory')}<input aria-label={t('projectDirectory')} value={newDirectory} maxLength={80} onChange={event => setNewDirectory(event.target.value)}/><small>projects/{newDirectory || '…'}/</small></label>
        <div className="er-setupOptions"><label>{t('aspectRatio')}<select aria-label={t('aspectRatio')} value={newSize} onChange={event => setNewSize(event.target.value as NewProjectRequest['size'])}><option value="youtube">16:9 · 1920 × 1080</option><option value="vertical">9:16 · 1080 × 1920</option><option value="square">1:1 · 1080 × 1080</option><option value="instagram">4:5 · 1080 × 1350</option></select></label><label>{t('theme')}<select aria-label={t('theme')} value={newTheme} onChange={event => setNewTheme(event.target.value as NewProjectRequest['theme'])}>{themes.map(theme => <option key={theme} value={theme}>{t(theme)}</option>)}</select></label></div>
      </> : null}
      <details className="er-engineSettings" open={!setup?.engineReady}><summary>{t('engine')}</summary><label>{t('engine')}<span className="er-pathField"><input aria-label={t('engine')} value={enginePath} onChange={event => setEnginePath(event.target.value)}/>{pickDirectory && <button className="er-icon" aria-label={t('engine')} onClick={() => void chooseFolder('engine')}><FolderOpen size={18}/></button>}</span></label></details>
      <div className="er-setupActions"><button className="er-button er-primary" disabled={loading || !libraryPath || (creating && (!newTitle.trim() || !/^[a-z0-9][a-z0-9_-]*$/i.test(newDirectory)))} onClick={() => void (creating ? initializeProject() : configure())}>{t(loading ? 'initializing' : creating ? 'initializeProject' : 'apply')}</button>{setup?.folderState && <button className="er-button" onClick={() => { setSettings(false); setCreating(false); setLibraryPath(setup?.libraryRoot ?? ''); }}>{t('back')}</button>}</div>
      </fieldset>
    </div> : loading ? <div className="er-loading" role="status"><RefreshCw className="er-spin"/>{t('loading')}</div> : project && scene ? <>
      <div className="er-workspace">
        <aside className="er-sceneRail">
          <div className="er-railTitle"><strong>{t('scenes')}</strong><span>{project.sceneCount}</span><button className="er-icon" aria-label={t('choose')} onClick={() => setSettings(true)}><FolderOpen size={16}/></button></div>

          <div className="er-sceneList">{project.scenes.map(item => <button key={item.id} className={'er-scene' + (item.id === selectedScene ? ' is-selected' : '')} onContextMenu={event => context(event, item.id, 'scene')} onClick={() => chooseScene(item.id)} aria-pressed={item.id === selectedScene}>
            <div className="er-thumb">{thumbs[item.id] ? <img src={thumbs[item.id]} alt=""/> : <Clapperboard size={20}/>}</div>
            <span className="er-sceneCopy"><strong>{String(item.index + 1).padStart(2, '0')} <span>{item.id}</span></strong><span>{item.duration.toFixed(1)}s {project.studio.scenes[item.id]?.locked && <LockKeyhole size={10}/>}</span><small>{item.text.slice(0, 30)}</small></span>
          </button>)}</div>
        </aside>
        <main className="er-main">
          <div className="er-canvasToolbar" onContextMenu={event => context(event, scene.id, 'visual')}><strong>{String(scene.index + 1).padStart(2, '0')} · {scene.id}</strong><span className={scene.cached ? 'er-cached' : 'er-estimated'}>{t(scene.cached ? 'cached' : 'estimated')}</span></div>
          <div className="er-stage" onContextMenu={event => context(event, scene.id, 'visual')}><iframe ref={iframe} title="explainroo scene preview" src={`${project.previewUrl}?channel=${channel.current}`} allow="autoplay"/></div>
          <div className="er-playbar"><button className="er-icon" aria-label={t('previous')} disabled={scene.index === 0 || dirty} onClick={() => chooseScene(project.scenes[scene.index - 1].id)}><ArrowLeft size={17}/></button><button className="er-icon er-play" aria-label={t(frame.playing ? 'pause' : 'play')} disabled={dirty} onClick={() => send('play')}>{frame.playing ? <Pause size={22}/> : <Play size={22}/>}</button><button className="er-icon" aria-label={t('next')} disabled={scene.index === project.scenes.length - 1 || dirty} onClick={() => chooseScene(project.scenes[scene.index + 1].id)}><ArrowRight size={17}/></button><span className="er-clock">{formatTime(frame.time)} / {formatTime(project.duration)}</span><span className="er-dimensions">{project.width} × {project.height} · {project.fps} fps</span></div>
          <section className="er-scriptEditor"><div className="er-sectionTitle"><strong className="er-scriptHeading" title={t('narrationHint')}>{t('narration')}</strong>{edit?.locked && <LockKeyhole size={12}/>}</div>
            <NarrationEditor key={`${project.folder}:${scene.id}:${editorEpoch}`} value={raw} hidden={false} disabled={!!edit?.locked || busy} canSave={dirty} renaming={!!renaming} save={() => void save()} change={value => { if (frame.playing && !dirty) send('play'); setRaw(value); }} seek={name => { if (!dirty) send('seek', scene.start + (scene.marks[name] ?? 0) + 0.05); }} context={markerContext} t={t}/>
            <div className="er-noteField"><span className="er-noteLabel" title={t('noteHint')}>{t('note')}</span>
              <textarea className="er-noteInput" aria-label={t('note')} value={note} disabled={!!edit?.locked || busy} onChange={event => setNote(event.target.value)} placeholder={t('notePlaceholder')}/>
            </div>
          </section>
          <section className="er-timeline" aria-label={t('audio')}>
            <div className="er-ruler"><span>{formatTime(scene.start)}</span><span>{formatTime(scene.start + scene.duration / 2)}</span><span>{formatTime(scene.start + scene.duration)}</span></div>
            <input className="er-scrubber" aria-label={t('current')} type="range" min="0" max={scene.duration} step={1 / project.fps} value={Math.max(0, Math.min(scene.duration, frame.time - scene.start))} disabled={dirty} onChange={event => send('seek', scene.start + Number(event.target.value))}/>
            <div className="er-track"><span><Image size={13}/>{t('visual')}</span><div className="er-visualClips">{Object.keys(scene.marks).map((mark, index) => <button key={mark} onClick={() => send('seek', scene.start + scene.marks[mark] + 0.8)} className={index % 2 ? 'is-cyan' : ''}>{mark}</button>)}</div></div>
            <div className="er-timelineFooter"><span>{t('current')} {scene.duration.toFixed(1)}s</span><span>{project.voice}</span></div>
          </section>
        </main>
        <aside className="er-inspector" onContextMenu={event => context(event, scene.id, selectedElement ? 'element' : 'visual', selectedElement)}>
          <div className="er-inspectorHeading"><strong>{t('properties')}</strong><small>{t('manualProperties')}</small></div>
          <div className="er-properties">
            <div className="er-objectPicker"><span title={t('rightClickHint')}>{t('objects')}</span><div className="er-objectList" aria-label={t('objects')}>{frame.elements.map(item => <button key={item.id} className={frame.selected === item.id ? 'is-selected' : ''} aria-pressed={frame.selected === item.id} title={item.id} onClick={() => send('select', item.id)} onContextMenu={event => context(event, scene.id, 'element', item)}><span>{item.text.slice(0, 26) || item.kind}</span><small>{item.kind} · {item.id}</small></button>)}</div></div>
            {!selectedElement ? <div className="er-inspectorEmpty"><Clapperboard size={26}/><strong title={t('selectHint')}>{t('noSelection')}</strong></div> : <fieldset disabled={!!edit?.locked || busy}>
              <div className="er-objectTitle"><span className="er-swatch" style={{ background: /^#/.test(selectedElement.color) ? selectedElement.color : '#ac87fa' }}/><div><strong>{selectedElement.text.slice(0, 35) || selectedElement.kind}</strong><small>{selectedElement.kind} · {selectedElement.id}</small></div></div>
              <div className="er-propertyGroup"><h3>{t('position')}</h3><div className="er-numberGrid">{(['x', 'y', 'w', 'h'] as const).map(key => <label key={key}>{key.toUpperCase()}<input aria-label={key.toUpperCase()} type="number" value={Math.round(elementValue(key, selectedElement[key]))} onChange={event => { if (event.target.value !== '') updateElement({ [key]: Number(event.target.value) }); }}/></label>)}</div></div>
              {selectedElement.kind !== 'image' && selectedElement.kind !== 'icon' && <div className="er-propertyGroup"><h3>{t('text')}</h3><textarea aria-label={t('text')} value={elementValue('text', selectedElement.text)} onChange={event => updateElement({ text: event.target.value })}/><label className="er-inlineField">{t('size')}<input aria-label={t('size')} type="number" min="1" max="500" value={elementValue('size', selectedElement.size)} onChange={event => { if (event.target.value) updateElement({ size: Number(event.target.value) }); }}/></label></div>}
              <div className="er-propertyGroup"><h3>{t('color')}</h3><input aria-label={t('color')} value={elementValue('color', selectedElement.color)} onChange={event => updateElement({ color: event.target.value })}/><div className="er-palette">{['#e8eef7', '#70ddf0', '#ae8afa', '#ffbf5f', '#81d4a8'].map(color => <button key={color} style={{ background: color }} aria-label={color} onClick={() => updateElement({ color })}/>)}</div></div>
              <div className="er-propertyGroup"><h3>{t('animation')}</h3><label>{t('entrance')}<select aria-label={t('entrance')} value={elementValue('enter', selectedElement.enter)} onChange={event => updateElement({ enter: event.target.value as ElementPatch['enter'] })}>{['none', 'fade', 'rise', 'pop', 'draw', 'zoom', 'slide-left', 'slide-right'].map(option => <option key={option}>{option}</option>)}</select></label><label>{t('timing')}<input aria-label={t('timing')} value={elementValue('at', selectedElement.at)} onChange={event => { const value = event.target.value; updateElement({ at: value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : value }); }}/></label></div>
            </fieldset>}
          </div>
          {edit?.locked && <p className="er-lockHint"><LockKeyhole size={14}/>{t('readOnly')}</p>}
          <div className="er-editActions"><button className="er-button er-primary" disabled={!dirty || busy || !!edit?.locked} onClick={() => void save()}><Save size={15}/>{t('save')}</button><button className="er-button er-quiet" disabled={!dirty || busy} onClick={discard}>{t('discard')}</button></div>
        </aside>
      </div>
    </> : project ? <div className="er-emptyWorkspace">
      <aside className="er-sceneRail"><div className="er-railTitle"><strong>{t('scenes')}</strong><span>0</span></div><div className="er-emptyRail"><Clapperboard size={24}/><p>{t('noScenesYet')}</p></div></aside>
      <main className="er-emptyMain"><div className="er-emptyCanvas" data-texture={project.appearance.background} style={{ backgroundColor: project.appearance.bg, color: ['paper', 'clean', 'editorial'].includes(project.appearance.theme) ? '#26221d' : '#e8eef7', aspectRatio: `${project.width}/${project.height}` }}><div className="er-emptyFrames"><span/><span/><span/></div><Clapperboard size={40}/><h1>{t('noScenesYet')}</h1><span className="er-emptyBadge">{project.width} × {project.height} · {project.fps} fps</span></div>
        <section className="er-startStory"><button className="er-button er-primary" disabled={!openConversation || openingConversation} onClick={() => void openProjectConversation()}><MessageSquare size={16}/>{t(openingConversation ? 'openingConversation' : 'createWithDSH')}</button></section>
      </main>
    </div> : <div className="er-workspaceEmpty"><FolderOpen size={36}/><h1>{t('noProjects')}</h1><button className="er-button er-primary" onClick={() => { setNewTitle(''); setNewDirectory(`video-${Date.now().toString(36)}`); setCreating(true); }}>{t('newProject')}</button></div>}
    </div>
    {renaming && <RenameDialog kind={renaming.kind} from={renaming.from} close={() => setRenaming(null)} save={async to => { setSaving(true); try { const next = await api.rename({ id: renaming.projectId, revision: renaming.revision, sceneId: renaming.sceneId, kind: renaming.kind, from: renaming.from, to, origin: 'user' }); accept(next, renaming.kind === 'scene' ? to : renaming.sceneId); setThumbs({}); setFrame(initialFrame); setRenaming(null); setNotice(t('saved')); } finally { setSaving(false); } }} t={t}/>}
    {settings && setup && <SettingsDialog setup={setup} project={project} disabled={busy || dirty} pickDirectory={pickDirectory} close={() => setSettings(false)} save={async value => {
      if (value.voice && project) accept(await api.voiceSettings({ id: project.id, revision: project.revision, voice: value.voice }));
      if (value.libraryRoot !== setup.libraryRoot || value.engineRoot !== (setup.configuredEngineRoot ?? setup.engineRoot)) { const next = await api.configure({ libraryRoot: value.libraryRoot, engineRoot: value.engineRoot }); setSetup(next); setLibraryPath(next.libraryRoot); setEnginePath(next.engineRoot); const selected = next.projects.find(item => item.folder === project?.folder) ?? next.projects[0]; if (selected && next.engineReady) accept(await api.project({ id: selected.id }), ''); else setProject(null); setThumbs({}); setFrame(initialFrame); }
      setSettings(false); setNotice(t('saved'));
    }} t={t}/>}
    {contextMenu && <div ref={menuRoot} role="menu" className="er-contextMenu" style={{ left: contextMenu.x, top: contextMenu.y }}><button role="menuitem" onClick={() => void copyReference()}><Copy size={15}/>{contextMenu.label}</button>{['scene', 'marker'].includes(contextMenu.kind) && <button role="menuitem" title={dirty ? t('dirtyHint') : undefined} disabled={busy || dirty || !!project?.studio.scenes[contextMenu.sceneId]?.locked} onClick={() => { beginRename(contextMenu.kind === 'marker' ? 'marker' : 'scene', contextMenu.marker ?? contextMenu.sceneId, contextMenu.sceneId); setContextMenu(null); }}><Pencil size={15}/>{t(contextMenu.kind === 'marker' ? 'renameMarker' : 'renameScene')}</button>}</div>}
    {copyFallback && <div role="dialog" aria-label={t('copyReference')} className="er-copyFallback"><div><h2>{t('copyReference')}</h2><p>{t('manualCopyHint')}</p><textarea aria-label={t('referenceText')} readOnly value={copyFallback} onFocus={event => event.target.select()}/><button className="er-button" onClick={() => setCopyFallback('')}>{t('close')}</button></div></div>}
  </section>;
}
