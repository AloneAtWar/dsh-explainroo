import { describe, expect, it, vi } from 'vitest';
import { nativeReferenceScope, registerSceneReferences, sceneSelection, type SceneReferenceSource } from '../src/client/scene-references.ts';
import type { ProjectDetail } from '../src/shared/types.ts';

const folder = 'D:\\videos\\demo';
const signal = () => new AbortController().signal;
function fixture() {
  const project: ProjectDetail = {
    id: 'demo', title: '视频示例', folder, revision: 'latest-revision', script: '', width: 1920, height: 1080, fps: 30, theme: 'midnight', voice: 'test', sceneCount: 2, duration: 10, hasVideo: false, previewUrl: '', allVoicesCached: false, canUndo: false, canRedo: false,
    appearance: { theme: 'midnight', bg: '#0b1020', background: 'glow', captions: true, custom: false },
    studio: { version: 1, revision: 2, stage: 'visual', scenes: { intro: { locked: true, note: '手动调整', elements: { box: { kind: 'box', baseText: '账户', patch: { x: 800 } } } } } },
    scenes: ['intro', 'second'].map((id, index) => ({ id, index, text: `${id} 的旁白`, raw: `[#a] ${id} 的最新旁白。`, start: index * 5, duration: 5, cached: false, marks: { a: 0 } })),
  };
  const selection = sceneSelection(); selection.set({ id: 'demo', folder, sceneId: 'intro', element: { id: 'box', kind: 'box', baseText: '账户' } });
  let scope: { sessionId: string; folder: string } | null = { sessionId: 'owned', folder };
  const load = vi.fn(async () => project); const dispose = vi.fn(); let source!: SceneReferenceSource;
  registerSceneReferences({ registerSource: value => { source = value; return dispose; } }, selection, load, target => { const id = (target as { sessionId?: string } | undefined)?.sessionId; return scope && (!id || id === scope.sessionId) ? scope : null; });
  const rows = (query = '') => source.candidates({ sessionId: 'owned' } as Parameters<SceneReferenceSource['candidates']>[0], { query, quoted: false, drilled: false, position: 'inline', signal: signal() });
  return { project, source, rows, load, selection, scope: (next: typeof scope) => { scope = next; } };
}
describe('native DSH scene references', () => {
  it('uses the selected video in an owned workbench chat without requiring a folder binding', () => {
    const service = { currentSession: () => 'owned', ownsSession: (id: string) => id === 'owned', isActive: () => true };
    expect(nativeReferenceScope(service, { id: 'demo', folder, sceneId: 'intro' }, { sessionId: 'owned' })).toEqual({ sessionId: 'owned', folder });
  });
  it('does not register context for a foreign, inactive or stale native session', () => {
    const service = { currentSession: () => 'foreign', ownsSession: () => false, isActive: () => true };
    const selected = { id: 'demo', folder };
    expect(nativeReferenceScope(service, selected)).toBeNull();
    expect(nativeReferenceScope({ ...service, ownsSession: () => true, isActive: () => false }, selected)).toBeNull();
    expect(nativeReferenceScope({ ...service, ownsSession: () => true }, selected, { sessionId: 'old' })).toBeNull();
  });
  it('offers the current scene, current project and searchable scene names in DSH', async () => {
    const app = fixture();
    expect((await app.rows()).map(item => item.name)).toEqual(['当前场景', '当前项目', '场景 intro', '场景 second']);
    expect((await app.rows('second')).map(item => item.name)).toEqual(['场景 second']);
  });
  it('does not expose references in unrelated sessions or when a different project is selected', async () => {
    const app = fixture(); app.scope(null); expect(await app.rows()).toEqual([]); expect(app.load).not.toHaveBeenCalled();
    app.scope({ sessionId: 'owned', folder: 'D:\\videos\\elsewhere' }); expect(await app.rows()).toEqual([]);
  });
  it('pins a picked scene while resolving its latest saved revision, locks and manual object edits', async () => {
    const app = fixture(); const picked = (await app.rows())[0];
    const outcome = app.source.onPick({ candidate: picked, session: { sessionId: 'owned' }, position: 'inline', via: 'menu', action: 'pick', span: { start: 0, end: 1, draftRev: 1 } } as Parameters<SceneReferenceSource['onPick']>[0]);
    expect(outcome).toMatchObject({ insert: { source: 'explainroo', label: '当前场景', ref: picked.value } });
    app.selection.set({ id: 'demo', folder, sceneId: 'second' });
    app.project.revision = 'newest-on-send'; app.project.scenes[0].raw = '[#a] 刚刚保存的旁白';
    const text = await app.source.codec!.serialize(picked.value!, signal());
    expect(text).toContain('newest-on-send'); expect(text).toContain('刚刚保存的旁白'); expect(text).toContain('"sceneId": "intro"'); expect(text).toContain('"locked": true'); expect(text).toContain('"x": 800');
  });
  it('rejects references if the native session switches while project data is loading', async () => {
    const app = fixture(); const picked = (await app.rows())[0];
    let finish!: (project: ProjectDetail) => void;
    app.load.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = app.source.codec!.serialize(picked.value!, signal());
    app.scope({ sessionId: 'another', folder }); finish(app.project);
    await expect(pending).rejects.toThrow('会话已切换');
  });
  it('rejects moved projects and deleted scenes rather than silently substituting another scene', async () => {
    const app = fixture(); const picked = (await app.rows())[0];
    app.project.folder = 'D:\\different-library\\demo';
    await expect(app.source.codec!.serialize(picked.value!, signal())).rejects.toThrow('项目或会话已切换');
    app.project.folder = folder; app.project.scenes = [];
    await expect(app.source.codec!.serialize(picked.value!, signal())).rejects.toThrow('场景已删除');
  });
  it('supports an empty project reference for creating its first scenes', async () => {
    const app = fixture(); app.project.scenes = []; app.selection.set({ id: 'demo', folder });
    const rows = await app.rows(); expect(rows.map(item => item.name)).toEqual(['当前项目']);
    expect(await app.source.codec!.serialize(rows[0].value!, signal())).toContain('"scenes": []');
  });
});
