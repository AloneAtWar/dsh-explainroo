import type { ComponentType } from 'react';

export interface NativeWorkbenches {
  register(descriptor: { title: string; repository: string; description: string; panelTitle: string; embedded: boolean; layout: { businessSide: 'right'; businessWidth: number } }, panel: ComponentType<any>): () => void;
  subscribe(listener: () => void): () => void;
  currentSession(): string | undefined;
  ownsSession(id: string): boolean;
  isActive(): boolean;
  ensureSession(request: { folder: string; sessionId?: string }): Promise<string>;
}
interface BindingStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
type SessionService = Pick<NativeWorkbenches, 'currentSession' | 'ownsSession' | 'isActive' | 'ensureSession'>;
const bindingKey = 'dsh-explainroo:session-folders:v1';
export const sameFolder = (a: string, b: string) => {
  const clean = (value: string) => { const path = value.replace(/\\/g, '/').replace(/\/+$/, ''); return /^[a-z]:\//i.test(path) ? path.toLowerCase() : path; };
  return clean(a) === clean(b);
};
export function projectSessions(service: SessionService, pickDirectory: () => Promise<string | null>, storage: BindingStorage) {
  const authorizedFolders = new Set<string>();
  const authorizeFolder = (folder: string) => { authorizedFolders.add(folder); };
  const read = (): Record<string, string> => {
    try { const value = JSON.parse(storage.getItem(bindingKey) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {}; }
    catch { return {}; }
  };
  const folder = (id = service.currentSession()): string | null => id && service.ownsSession(id) ? read()[id] ?? null : null;
  async function open(project: { folder: string }, isCurrent: () => boolean = () => true): Promise<boolean> {
    if (!service.isActive()) return false;
    const original = service.currentSession();
    const bindings = read();
    const saved = Object.entries(bindings).find(([id, path]) => sameFolder(path, project.folder) && service.ownsSession(id))?.[0];
    const sessionId = original && service.ownsSession(original) && bindings[original] && sameFolder(bindings[original], project.folder) ? original : saved;
    if (!sessionId && ![...authorizedFolders].some(folder => sameFolder(folder, project.folder))) {
      const chosen = await pickDirectory();
      if (chosen === null) return false;
      if (!sameFolder(chosen, project.folder)) throw new Error(`请选择当前视频项目目录：${project.folder}`);
    }
    if (!service.isActive() || service.currentSession() !== original || !isCurrent()) return false;
    const result = await service.ensureSession({ folder: project.folder, ...(sessionId ? { sessionId } : {}) });
    if (!service.ownsSession(result)) return false;
    storage.setItem(bindingKey, JSON.stringify({ ...read(), [result]: project.folder }));
    return service.isActive() && service.currentSession() === result && isCurrent();
  }
  return { open, folder, authorizeFolder };
}
