import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import { useEffect, useRef, useState } from 'react';
import { Workbench } from './Workbench.tsx';
import { zh, en, type CopyKey } from './copy.ts';
import { remote, type RemoteMethod } from '../shared/remote.ts';
import type { WorkbenchApi } from '../shared/types.ts';
import nativeCss from './native.css?inline';
import { projectSessions, sameFolder, type NativeWorkbenches } from './project-session.ts';
import { nativeReferenceScope, registerSceneReferences, sceneSelection } from './scene-references.ts';
import { attachNativeSplit } from './native-split.ts';

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'explainroo': CopyKey } }
export const inject = ['remote', 'locale', 'uiWorkspace', 'desktopWorkbenches'];
export function apply(ctx: Context): void {
  ctx.effect(() => { const tag = document.createElement('style'); tag.textContent = nativeCss; tag.dataset.explainroo = 'native'; document.head.appendChild(tag); return () => tag.remove(); }, 'explainroo: native frame styles');
  ctx.effect(() => ctx.locale.register('explainroo', { zh, en }), 'explainroo: locale');
  const workbenches = ctx.get('desktopWorkbenches') as NativeWorkbenches;
  const pickDirectory = async () => {
    const bridge = (globalThis as any).__DSH_DIRECTORY_PICKER__;
    const folder = await (bridge ? bridge.pick() as Promise<string | null> : ctx.uiWorkspace.pickDirectory());
    if (folder) sessions.authorizeFolder(folder);
    return folder;
  };
  const call = async (method: RemoteMethod, request: unknown) => {
    const service = ctx.get('remote.explainroo') as Record<string, (input: unknown) => Promise<{ ok: boolean; value?: any; error?: { message?: string } }>> | undefined;
    if (!service) throw new Error('工作台服务尚未连接，请稍后重试。');
    const answer = await service[method](request);
    if (!answer.ok) throw new Error(answer.error?.message ?? '工作台操作失败。');
    return answer.value;
  };
  const api: WorkbenchApi = {
    rename: request => call('rename', request), validate: request => call('validate', request),
    inspectFolder: request => call('inspectFolder', request), createProject: request => call('createProject', request), installSkill: request => call('installSkill', request),
    setup: () => call('setup', {}), configure: request => call('configure', request), project: request => call('project', request), save: request => call('save', request),
    stage: request => call('stage', request), appearance: request => call('appearance', request), history: request => call('history', request), task: request => call('task', request), tasks: request => call('tasks', request), cancel: request => call('cancel', request),
    voiceSettings: request => call('voiceSettings', request),
    download: request => call('download', request),
  };
  const sessions = projectSessions(workbenches, pickDirectory, localStorage);
  const selection = sceneSelection();
  ctx.inject(['inputTriggers'], triggerCtx => triggerCtx.effect(() => registerSceneReferences(
    triggerCtx.get('inputTriggers') as Parameters<typeof registerSceneReferences>[0], selection,
    id => api.project({ id }), target => nativeReferenceScope(workbenches, selection.get(), target),
  ), 'explainroo: native scene references'));
  ctx.effect(async () => {
    const disposeRemote = await ctx.remote.$mount(remote);
    if (ctx.fiber.state >= 5) { await disposeRemote(); return () => {}; }
    function Panel() {
      const shell = useRef<HTMLDivElement>(null); const separator = useRef<HTMLDivElement>(null);
      useEffect(() => shell.current && separator.current ? attachNativeSplit(shell.current, separator.current, () => workbenches.isActive(), listener => workbenches.subscribe(listener), localStorage) : undefined, []);
      const [restoreFolder, setRestoreFolder] = useState<string | null>(null);
      useEffect(() => {
        const restore = () => { if (workbenches.isActive()) setRestoreFolder(sessions.folder()); };
        restore(); return workbenches.subscribe(restore);
      }, []);
      return <div ref={shell} className="er-nativeShell"><div ref={separator} className="er-nativeResize" role="separator" aria-label="调整对话与工作台宽度" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={75} aria-valuenow={30} tabIndex={0} hidden title="拖动调整宽度 · 方向键微调 · 双击恢复默认"/><div className="er-nativeBusiness"><Workbench api={api} pickDirectory={pickDirectory} restoreFolder={restoreFolder} onContextChange={selection.set} openConversation={async project => sessions.open({ folder: (await api.setup()).libraryRoot }, () => { const current = selection.get(); return !!current && sameFolder(current.folder, project.folder); })} t={ctx.locale.bind('explainroo')}/></div></div>;
    }
    const disposePanel = workbenches.register({ title: '讲解视频工作台', repository: 'https://github.com/AloneAtWar/dsh-explainroo', description: '在 DSH 中对话，在工作台预览、编辑和导出讲解视频', panelTitle: 'Explainroo', embedded: true, layout: { businessSide: 'right', businessWidth: 0.7 } }, Panel);
    return async () => { disposePanel(); await disposeRemote(); };
  }, 'explainroo: native workbench and remote');
}
