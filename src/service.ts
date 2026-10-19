import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { Config } from './config.ts';
import { Projects } from './host/projects.ts';
import { Previews } from './host/preview.ts';
import { Tasks } from './host/tasks.ts';
import { requests, type RemoteMethod } from './shared/remote.ts';
import type { EditRequest, TaskAction } from './shared/types.ts';
import { inspectFolder } from './host/workspace.ts';

export class Workbench {
  readonly projects: Projects;
  readonly previews: Previews;
  readonly tasks: Tasks;
  readonly ready: Promise<void>;
  constructor(config: Config) {
    this.projects = new Projects({ ...config }); this.previews = new Previews(this.projects); this.tasks = new Tasks(this.projects);
    this.projects.previewUrl = id => this.previews.open(id);
    this.ready = this.projects.initialize();
  }
  async invoke(method: RemoteMethod, input: unknown, signal?: AbortSignal): Promise<any> {
    signal?.throwIfAborted(); await this.ready;
    const request = requests[method].parse(input) as any;
    switch (method) {
      case 'setup': return this.projects.setup();
      case 'configure': if (this.tasks.hasRunning()) throw new Error('请等待当前生成任务完成或先取消，再切换目录。'); await this.previews.close(); return this.projects.configure(request);
      case 'inspectFolder': return inspectFolder(request.folder);
      case 'createProject': if (this.tasks.hasRunning()) throw new Error('请等待当前生成任务完成或先取消，再初始化项目。'); { const result = await this.projects.createProject(request); await this.previews.close(); return result; }
      case 'installSkill': return this.projects.installSkill(request.id);
      case 'project': return this.projects.get(request.id);
      case 'save': return this.projects.save(request);
      case 'rename': { const result = await this.projects.rename(request); await this.previews.close(); return this.projects.get(result.id); }
      case 'validate': return this.projects.validate(request.id);
      case 'stage': return this.projects.mutate(request.id, request.revision, snapshot => { snapshot.studio.stage = request.stage; });
      case 'appearance': return this.projects.mutate(request.id, request.revision, snapshot => { snapshot.studio.appearance = request.appearance; });
      case 'voiceSettings': return this.projects.setVoice(request);
      case 'history': return this.projects.history(request.id, request.direction, request.revision);
      case 'task': return this.tasks.start(request.id, request.action);
      case 'tasks': return this.tasks.list(request.id === '*' ? undefined : request.id);
      case 'cancel': return this.tasks.cancel(request.taskId);
      case 'download': return this.tasks.download(request.taskId);
    }
  }
  async close(): Promise<void> { await this.tasks.close(); await this.previews.close(); }
}
export class ExplainrooService extends TypertRemoteService {
  readonly workbench: Workbench;
  constructor(ctx: Context, config: Config) {
    super(ctx, 'explainroo'); this.workbench = new Workbench(config);
    ctx.effect(() => () => this.workbench.close(), 'explainroo: processes and preview servers');
  }
  setup(request: {}, signal?: AbortSignal) { return this.workbench.invoke('setup', request, signal); }
  configure(request: { libraryRoot?: string; engineRoot?: string }, signal?: AbortSignal) { return this.workbench.invoke('configure', request, signal); }
  inspectFolder(request: unknown, signal?: AbortSignal) { return this.workbench.invoke('inspectFolder', request, signal); }
  createProject(request: unknown, signal?: AbortSignal) { return this.workbench.invoke('createProject', request, signal); }
  installSkill(request: unknown, signal?: AbortSignal) { return this.workbench.invoke('installSkill', request, signal); }
  project(request: { id: string }, signal?: AbortSignal) { return this.workbench.invoke('project', request, signal); }
  save(request: EditRequest, signal?: AbortSignal) { return this.workbench.invoke('save', request, signal); }
  rename(request: unknown, signal?: AbortSignal) { return this.workbench.invoke('rename', request, signal); }
  validate(request: unknown, signal?: AbortSignal) { return this.workbench.invoke('validate', request, signal); }
  stage(request: unknown, signal?: AbortSignal) { return this.workbench.invoke('stage', request, signal); }
  appearance(request: unknown, signal?: AbortSignal) { return this.workbench.invoke('appearance', request, signal); }
  voiceSettings(request: unknown, signal?: AbortSignal) { return this.workbench.invoke('voiceSettings', request, signal); }
  history(request: unknown, signal?: AbortSignal) { return this.workbench.invoke('history', request, signal); }
  task(request: { id: string; action: TaskAction }, signal?: AbortSignal) { return this.workbench.invoke('task', request, signal); }
  tasks(request: { id: string }, signal?: AbortSignal) { return this.workbench.invoke('tasks', request, signal); }
  cancel(request: { taskId: string }, signal?: AbortSignal) { return this.workbench.invoke('cancel', request, signal); }
  download(request: { taskId: string }, signal?: AbortSignal) { return this.workbench.invoke('download', request, signal); }
}
