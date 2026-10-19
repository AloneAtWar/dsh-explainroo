import { describe, expect, it } from 'vitest';
import { referencePrompt, markerReferencePrompt } from '../src/client/reference-prompt.ts';
import type { ProjectDetail } from '../src/shared/types.ts';
const project = { id: 'projects/video-a', folder: 'D:/workspace/projects/video-a', revision: 'current-revision', scenes: [{ id: 'intro', raw: '[#a] 原始旁白' }], studio: { scenes: { intro: { locked: true } } } } as unknown as ProjectDetail;
describe('DSH locator prompt', () => {
  it('copies an exact Chinese cue locator as pure JSON including the current unsaved text', () => {
    const raw = '开头[#账户内容]余额、代币与状态。';
    const prompt = markerReferencePrompt(project, 'intro', '账户内容', 'D:/workspace', raw);
    const data = JSON.parse(prompt);
    expect(data).toMatchObject({ target: 'marker', sceneId: 'intro', projectFolder: project.folder, revisionAtCopy: project.revision, hasUnsavedChanges: true, narration: raw, marker: { name: '账户内容', token: '[#账户内容]', textOffset: 2, textAfter: '余额、代币与状态。' } });
    expect(prompt).toBe(JSON.stringify(data, null, 2));
    expect(() => markerReferencePrompt(project, 'intro', '不存在')).toThrow('触发点不存在');
  });
  it('distinguishes projects and carries stable scene identity instead of list positions', () => {
    const text = referencePrompt(project, 'intro', 'scene', undefined, 'D:/workspace');
    expect(JSON.parse(text)).toMatchObject({ workspace: 'D:/workspace', projectFolder: project.folder, target: 'scene' }); expect(text).toBe(JSON.stringify(JSON.parse(text), null, 2)); expect(text).toContain(project.folder); expect(text).toContain('"sceneId": "intro"'); expect(text).toContain('"locked": true'); expect(text).toContain('[#a]');
    const other = referencePrompt({ ...project, folder: 'D:/workspace/projects/video-b' }, 'intro', 'visual');
    expect(other).toContain('D:/workspace/projects/video-b'); expect(other).not.toContain(project.folder);
  });
  it('copies exact object identity and original text, preserving escaped content', () => {
    const text = referencePrompt(project, 'intro', 'element', { id: 'title', kind: 'text', baseText: '标题 "引号"\n换行' });
    const data = JSON.parse(text);
    expect(data.element).toEqual({ id: 'title', kind: 'text', baseText: '标题 "引号"\n换行' }); expect(data.revisionAtCopy).toBe(project.revision);
    expect(() => referencePrompt(project, 'removed', 'scene')).toThrow('场景不存在'); expect(() => referencePrompt(project, 'intro', 'element')).toThrow('先选择');
  });
});
