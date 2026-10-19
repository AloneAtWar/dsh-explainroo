import { createRoot } from 'react-dom/client';
import { Workbench } from '../client/Workbench.tsx';
import type { WorkbenchApi } from '../shared/types.ts';
import type { RemoteMethod } from '../shared/remote.ts';
async function call(method: RemoteMethod, request: unknown = {}) {
  const response = await fetch(`/api/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Explainroo-Token': (window as any).__EXPLAINROO_TOKEN__ }, body: JSON.stringify(request) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
  return result;
}
const api: WorkbenchApi = {
  rename: request => call('rename', request), validate: request => call('validate', request),
  voiceSettings: request => call('voiceSettings', request),
  download: request => call('download', request),
  inspectFolder: request => call('inspectFolder', request), createProject: request => call('createProject', request), installSkill: request => call('installSkill', request),
  setup: () => call('setup'), configure: request => call('configure', request), project: request => call('project', request), save: request => call('save', request),
  stage: request => call('stage', request), appearance: request => call('appearance', request), history: request => call('history', request), task: request => call('task', request), tasks: request => call('tasks', request), cancel: request => call('cancel', request),
};
createRoot(document.getElementById('root')!).render(<Workbench api={api}/>);
