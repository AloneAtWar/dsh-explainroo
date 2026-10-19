import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { JobOutcome } from '@deepseek-ai/dsh-jobs';
import type { ExplainrooService } from './service.ts';
import { requests } from './shared/remote.ts';

declare module '@deepseek-ai/dsh-jobs' { interface JobKindMap { explainroo: 'explainroo' } }
const output = { schema: { type: 'json' } as const, render: (_: unknown, result: any) => [{ type: 'text' as const, text: JSON.stringify(result) }] };
const present = (title: string, rawInput: unknown) => ({ card: 'generic' as const, kind: 'other' as const, title, rawInput });
const json = (value: unknown): any => JSON.parse(JSON.stringify(value));

export function registerTools(ctx: Context, service: ExplainrooService): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'explainroo_setup', description: 'Inspect the explainer workbench, engine and local project library. Optional paths configure the requested library/engine. Never reads or returns API keys. Call first when using the workbench.',
    parameters: { libraryRoot: { type: 'string' }, engineRoot: { type: 'string' } }, output,
    presentCall: args => present('讲解视频工作台', args),
    execute: async (args, exec) => json(await service.workbench.invoke(args.libraryRoot !== undefined || args.engineRoot !== undefined ? 'configure' : 'setup', args, exec.signal)),
  })), 'explainroo: setup tool');
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'explainroo_project', description: 'Read a local explainer project with scene ids, narration markers, saved visual overrides, locks and optimistic revision. Preview is silent when narration is not cached and never triggers paid speech generation.',
    parameters: { id: { type: 'string', required: true } }, output,
    presentCall: args => present('读取视频项目', args), execute: async (args, exec) => json(await service.project(args, exec.signal)),
  })), 'explainroo: project tool');
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'explainroo_edit_scene', description: 'Modify ONE scene using the latest revision from explainroo_project. Preserve [#marker] tokens and user decisions. Write/update note for every scene with composition, object relationships and animation order. Locked scenes cannot be changed by AI. element is {kind,baseText,patch:{text,x,y,w,h,size,color,at,out,enter}} using an existing element id. Read project again on revision conflicts. All edits can be undone in the workbench.',
    parameters: { id: { type: 'string', required: true }, sceneId: { type: 'string', required: true }, revision: { type: 'string', required: true }, raw: { type: 'string' }, note: { type: 'string' }, elementId: { type: 'string' }, element: { type: 'json' } }, output,
    presentCall: args => present('修改当前分镜', args),
    execute: async (args, exec) => json(await service.save(requests.save.parse({ ...args, origin: 'ai' }), exec.signal)),
  })), 'explainroo: edit tool');
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'explainroo_rename', description: 'Rename a scene or narration cue, including Chinese names, as one validated transaction. Updates script.md, drawing references, cover and manual edits, preserving valid cached speech. Never use a translated display-name map. kind is scene or marker; marker requires from. Requires latest revision; locked scenes are protected. Shared/dynamic references which cannot be safely rewritten are rejected.',
    parameters: { id: { type: 'string', required: true }, revision: { type: 'string', required: true }, sceneId: { type: 'string', required: true }, kind: { type: 'string', required: true, enum: ['scene', 'marker'] }, from: { type: 'string' }, to: { type: 'string', required: true } }, output,
    presentCall: args => present('重命名场景或触发点', args), execute: async (args, exec) => json(await service.rename({ ...args, origin: 'ai' }, exec.signal)),
  })), 'explainroo: rename tool');
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'explainroo_validate', description: 'Validate scene functions, narration cue references, duplicate names, manual timing overrides and cover references after editing project files. Static analysis only: no TTS, no project JavaScript execution. ok=false includes file/line diagnostics; unresolved dynamic definitions are not reported as verified. Run after Agent file changes before claiming completion.',
    parameters: { id: { type: 'string', required: true } }, output,
    presentCall: args => present('验证场景引用', args), execute: async (args, exec) => json(await service.validate(args, exec.signal)),
  })), 'explainroo: validate tool');
  ctx.inject(['jobs'], jobCtx => {
    jobCtx.effect(() => jobCtx.tools.register(defineTool({
      name: 'explainroo_run', description: 'Start voice, check, sheet or render as a native Harness background job. render automatically prepares missing/stale voice and may incur configured MiMo/ElevenLabs charges; only run on explicit video export requests. sheet exports silently without TTS; check requires cached voice. Render includes saved visual edits and returns an output file. Use job_output(wait=true) or job_kill for completion/cancellation.',
      parameters: { id: { type: 'string', required: true }, action: { type: 'string', required: true, enum: ['voice', 'check', 'sheet', 'render'] } },
      output: { schema: { type: 'object', additionalProperties: false, properties: { kind: { type: 'string', required: true, const: 'background' }, jobId: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: `started background job ${value.jobId}` }] },
      presentCall: args => present('视频生成任务', args),
      execute: async (args, exec) => {
        const request = requests.task.parse(args); await service.workbench.ready; exec.signal.throwIfAborted();
        const jobId = jobCtx.jobs.start({
          kind: 'explainroo', label: `${request.action}: ${request.id}`, ...(exec.agent ? { owner: exec.agent.session.id } : {}),
          run: handle => {
            let taskId: string | undefined; let cancelled = false;
            const done = (async (): Promise<JobOutcome> => {
              try {
                const task = await service.workbench.tasks.start(request.id, request.action); taskId = task.id;
                if (cancelled) await service.workbench.tasks.cancel(taskId);
                const result = await service.workbench.tasks.wait(taskId);
                handle.append(result.log);
                return { status: result.status === 'completed' ? 'completed' : result.status === 'cancelled' ? 'killed' : 'failed', result: JSON.stringify(result) };
              } catch (error) { return { status: 'failed', result: error instanceof Error ? error.message : String(error) }; }
            })();
            return { done, cancel: () => { cancelled = true; if (taskId) void service.workbench.tasks.cancel(taskId); } };
          },
        });
        return { kind: 'background' as const, jobId };
      },
    })), 'explainroo: native background job tool');
  });
}
