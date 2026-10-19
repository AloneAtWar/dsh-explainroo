import { describe, expect, it } from 'vitest';
import { wrapScenes } from '../src/shared/scene-adapter.ts';
import type { StudioState } from '../src/shared/types.ts';

function fixture() {
  const calls: any[] = [];
  return {
    calls,
    stage: { t: 2, engine: { scale: 1 }, ctx: { getTransform: () => ({ transformPoint: (point: any) => point }) }, time: (value: number) => value,
      box: (text: string, options: any) => { calls.push({ text, ...options }); return { x: options.x, y: options.y, w: options.w, h: options.h }; } },
  };
}
const state = (): StudioState => ({ version: 1, revision: 1, stage: 'visual', scenes: { demo: { locked: false, note: '', elements: { program: { kind: 'box', baseText: '程序', patch: { text: '代币程序', x: 640, color: '#ffbe56' } } } } } });
describe('shared preview and export adapter', () => {
  it('applies the same saved edit after serialization for export', () => {
    const source = { demo: (s: any) => s.box('程序', { id: 'program', x: 200, y: 300, w: 250, h: 100 }) };
    const preview = fixture(); const exported = fixture();
    wrapScenes(source, state).demo(preview.stage);
    wrapScenes(source, () => JSON.parse(JSON.stringify(state()))).demo(exported.stage);
    expect(preview.calls).toEqual(exported.calls);
    expect(exported.calls[0]).toMatchObject({ id: 'program', text: '代币程序', x: 640, color: '#ffbe56' });
  });
  it('does not apply an old edit to an object an agent has replaced', () => {
    const next = fixture();
    wrapScenes({ demo: (s: any) => s.box('另一种对象', { id: 'program', x: 200, y: 300, w: 250, h: 100 }) }, state).demo(next.stage);
    expect(next.calls[0]).toMatchObject({ text: '另一种对象', x: 200 });
  });
  it('records hit targets in rendered coordinates and marks future objects invisible', () => {
    const next = fixture(); let recorded: any;
    wrapScenes({ demo: (s: any) => s.box('将出现', { x: 200, y: 300, w: 100, h: 60, at: 4 }) }, state, (_, elements) => { recorded = elements; }).demo(next.stage);
    expect(recorded[0]).toMatchObject({ id: 'box:1', visible: false, screen: { x: 150, y: 270, w: 100, h: 60 } });
  });
  it('translates a circle width edit into the engine radius', () => {
    const edited = state(); edited.scenes.demo.elements.circle = { kind: 'circle', baseText: '圆', patch: { w: 180, h: 180 } };
    let radius = 0;
    const stage = { circle(options: any) { radius = options.r; }, engine: {}, ctx: {} };
    wrapScenes({ demo: (s: any) => s.circle({ id: 'circle', label: '圆', r: 30 }) }, () => edited).demo(stage);
    expect(radius).toBe(90);
  });
});
