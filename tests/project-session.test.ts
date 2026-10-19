import { describe, expect, it, vi } from 'vitest';
import { projectSessions } from '../src/client/project-session.ts';

const folder = 'D:\\videos\\demo';
function setup(bindings: Record<string, string> = {}) {
  let current: string | undefined; let active = true;
  const owned = new Set<string>(); const values = new Map([['dsh-explainroo:session-folders:v1', JSON.stringify(bindings)]]);
  const picker = vi.fn(async (): Promise<string | null> => folder);
  const ensure = vi.fn(async (request: { folder: string; sessionId?: string }) => { current = request.sessionId ?? 'created'; owned.add(current); return current; });
  const service = { currentSession: () => current, ownsSession: (id: string) => owned.has(id), isActive: () => active, ensureSession: ensure };
  const bridge = projectSessions(service, picker, { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } });
  return { bridge, picker, ensure, owned, setCurrent: (id: string) => { current = id; }, deactivate: () => { active = false; }, values };
}
describe('native project conversation', () => {
  it('uses the folder already selected for initialization without asking for it a second time', async () => {
    const app = setup(); app.bridge.authorizeFolder('d:/videos/demo/');
    expect(await app.bridge.open({ folder })).toBe(true); expect(app.picker).not.toHaveBeenCalled(); expect(app.ensure).toHaveBeenCalledWith({ folder });
    await expect(app.bridge.open({ folder: 'D:\\videos\\unselected' })).rejects.toThrow('当前视频项目目录');
  });
  it('does not create or bind a session when directory selection is cancelled', async () => {
    const app = setup(); app.picker.mockResolvedValue(null);
    expect(await app.bridge.open({ folder })).toBe(false); expect(app.ensure).not.toHaveBeenCalled(); expect(app.bridge.folder()).toBeNull();
  });
  it('rejects a different project directory before touching native sessions', async () => {
    const app = setup(); app.picker.mockResolvedValue('D:\\videos\\other');
    await expect(app.bridge.open({ folder })).rejects.toThrow('当前视频项目目录'); expect(app.ensure).not.toHaveBeenCalled();
  });
  it('reuses the active owned project conversation without replacing its draft or asking again', async () => {
    const app = setup({ older: folder, active: 'd:/videos/demo/' }); app.owned.add('older'); app.owned.add('active'); app.setCurrent('active');
    expect(await app.bridge.open({ folder })).toBe(true);
    expect(app.ensure).toHaveBeenCalledWith({ folder, sessionId: 'active' }); expect(app.picker).not.toHaveBeenCalled();
  });
  it('never adopts another workbench conversation even if a stored folder matches', async () => {
    const app = setup({ foreign: folder }); app.setCurrent('foreign');
    expect(await app.bridge.open({ folder })).toBe(true);
    expect(app.picker).toHaveBeenCalledOnce(); expect(app.ensure).toHaveBeenCalledWith({ folder }); expect(app.bridge.folder()).toBe(folder);
    expect(app.bridge.folder('foreign')).toBeNull();
  });
  it('does not navigate after the native session or selected project changed during a picker', async () => {
    const app = setup(); app.picker.mockImplementation(async () => { app.setCurrent('elsewhere'); return folder; });
    expect(await app.bridge.open({ folder })).toBe(false); expect(app.ensure).not.toHaveBeenCalled();
    const other = setup(); expect(await other.bridge.open({ folder }, () => false)).toBe(false); expect(other.ensure).not.toHaveBeenCalled();
  });
});
