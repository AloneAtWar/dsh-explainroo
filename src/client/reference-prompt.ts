import type { EditableElement, ProjectDetail } from '../shared/types.ts';
import { narrationDocument } from './narration.ts';
export type ReferenceKind = 'scene' | 'visual' | 'element';
export function referencePrompt(project: ProjectDetail, sceneId: string, kind: ReferenceKind, element?: Pick<EditableElement, 'id' | 'kind' | 'baseText'>, workspace?: string): string {
  const scene = project.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error('场景不存在，请刷新后重新复制。');
  if (kind === 'element' && !element) throw new Error('请先选择一个画面对象。');
  const context = { workspace: workspace ?? project.folder, projectId: project.id, projectFolder: project.folder, sceneId, target: kind, revisionAtCopy: project.revision, ...(element ? { element: { id: element.id, kind: element.kind, baseText: element.baseText } } : {}), narration: scene.raw, locked: project.studio.scenes[sceneId]?.locked ?? false };
  return JSON.stringify(context, null, 2);
}
export function markerReferencePrompt(project: ProjectDetail, sceneId: string, name: string, workspace?: string, draft?: string): string {
  const scene = project.scenes.find(item => item.id === sceneId);
  if (!scene) throw new Error('场景不存在，请刷新后重新复制。');
  const raw = draft ?? scene.raw; const document = narrationDocument(raw);
  const anchor = document.anchors.find(item => item.marker === name);
  if (!anchor) throw new Error('触发点不存在，请重新复制。');
  return JSON.stringify({ ...JSON.parse(referencePrompt(project, sceneId, 'scene', undefined, workspace)), target: 'marker', narration: raw, hasUnsavedChanges: raw !== scene.raw,
    marker: { name, token: anchor.token, textOffset: anchor.offset, textAfter: document.text.slice(anchor.offset, anchor.offset + 100) } }, null, 2);
}
