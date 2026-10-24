import { i as Config, n as Projects, r as inspectFolder, t as Tasks } from "./tasks-DHSU2mS_.js";
import { t as Previews } from "./preview-DIMaN2lS.js";
import { n as requests } from "./remote-BCmqyRsB.js";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/service.ts
var Workbench = class {
	projects;
	previews;
	tasks;
	ready;
	constructor(config) {
		this.projects = new Projects({ ...config });
		this.previews = new Previews(this.projects);
		this.tasks = new Tasks(this.projects);
		this.projects.previewUrl = (id) => this.previews.open(id);
		this.ready = this.projects.initialize();
	}
	async invoke(method, input, signal) {
		signal?.throwIfAborted();
		await this.ready;
		const request = requests[method].parse(input);
		switch (method) {
			case "setup": return this.projects.setup();
			case "configure":
				if (this.tasks.hasRunning()) throw new Error("请等待当前生成任务完成或先取消，再切换目录。");
				await this.previews.close();
				return this.projects.configure(request);
			case "inspectFolder": return inspectFolder(request.folder);
			case "createProject":
				if (this.tasks.hasRunning()) throw new Error("请等待当前生成任务完成或先取消，再初始化项目。");
				{
					const result = await this.projects.createProject(request);
					await this.previews.close();
					return result;
				}
			case "installSkill": return this.projects.installSkill(request.id);
			case "project": return this.projects.get(request.id);
			case "save": return this.projects.save(request);
			case "rename": {
				const result = await this.projects.rename(request);
				await this.previews.close();
				return this.projects.get(result.id);
			}
			case "validate": return this.projects.validate(request.id);
			case "stage": return this.projects.mutate(request.id, request.revision, (snapshot) => {
				snapshot.studio.stage = request.stage;
			});
			case "appearance": return this.projects.mutate(request.id, request.revision, (snapshot) => {
				snapshot.studio.appearance = request.appearance;
			});
			case "voiceSettings": return this.projects.setVoice(request);
			case "history": return this.projects.history(request.id, request.direction, request.revision);
			case "task": return this.tasks.start(request.id, request.action);
			case "tasks": return this.tasks.list(request.id === "*" ? void 0 : request.id);
			case "cancel": return this.tasks.cancel(request.taskId);
			case "download": return this.tasks.download(request.taskId);
		}
	}
	async close() {
		await this.tasks.close();
		await this.previews.close();
	}
};
var ExplainrooService = class extends TypertRemoteService {
	workbench;
	constructor(ctx, config) {
		super(ctx, "explainroo");
		this.workbench = new Workbench(config);
		ctx.effect(() => () => this.workbench.close(), "explainroo: processes and preview servers");
	}
	setup(request, signal) {
		return this.workbench.invoke("setup", request, signal);
	}
	configure(request, signal) {
		return this.workbench.invoke("configure", request, signal);
	}
	inspectFolder(request, signal) {
		return this.workbench.invoke("inspectFolder", request, signal);
	}
	createProject(request, signal) {
		return this.workbench.invoke("createProject", request, signal);
	}
	installSkill(request, signal) {
		return this.workbench.invoke("installSkill", request, signal);
	}
	project(request, signal) {
		return this.workbench.invoke("project", request, signal);
	}
	save(request, signal) {
		return this.workbench.invoke("save", request, signal);
	}
	rename(request, signal) {
		return this.workbench.invoke("rename", request, signal);
	}
	validate(request, signal) {
		return this.workbench.invoke("validate", request, signal);
	}
	stage(request, signal) {
		return this.workbench.invoke("stage", request, signal);
	}
	appearance(request, signal) {
		return this.workbench.invoke("appearance", request, signal);
	}
	voiceSettings(request, signal) {
		return this.workbench.invoke("voiceSettings", request, signal);
	}
	history(request, signal) {
		return this.workbench.invoke("history", request, signal);
	}
	task(request, signal) {
		return this.workbench.invoke("task", request, signal);
	}
	tasks(request, signal) {
		return this.workbench.invoke("tasks", request, signal);
	}
	cancel(request, signal) {
		return this.workbench.invoke("cancel", request, signal);
	}
	download(request, signal) {
		return this.workbench.invoke("download", request, signal);
	}
};
//#endregion
//#region src/tools.ts
const output = {
	schema: { type: "json" },
	render: (_, result) => [{
		type: "text",
		text: JSON.stringify(result)
	}]
};
const present = (title, rawInput) => ({
	card: "generic",
	kind: "other",
	title,
	rawInput
});
const json = (value) => JSON.parse(JSON.stringify(value));
function registerTools(ctx, service) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "explainroo_setup",
		description: "Inspect the explainer workbench, engine and local project library. Optional paths configure the requested library/engine. Never reads or returns API keys. Call first when using the workbench.",
		parameters: {
			libraryRoot: { type: "string" },
			engineRoot: { type: "string" }
		},
		output,
		presentCall: (args) => present("讲解视频工作台", args),
		execute: async (args, exec) => json(await service.workbench.invoke(args.libraryRoot !== void 0 || args.engineRoot !== void 0 ? "configure" : "setup", args, exec.signal))
	})), "explainroo: setup tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "explainroo_project",
		description: "Read a local explainer project with scene ids, narration markers, saved visual overrides, locks and optimistic revision. Preview is silent when narration is not cached and never triggers paid speech generation.",
		parameters: { id: {
			type: "string",
			required: true
		} },
		output,
		presentCall: (args) => present("读取视频项目", args),
		execute: async (args, exec) => json(await service.project(args, exec.signal))
	})), "explainroo: project tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "explainroo_edit_scene",
		description: "Modify ONE scene using the latest revision from explainroo_project. Preserve [#marker] tokens and user decisions. Write/update note for every scene with composition, object relationships and animation order. Locked scenes cannot be changed by AI. element is {kind,baseText,patch:{text,x,y,w,h,size,color,at,out,enter}} using an existing element id. Read project again on revision conflicts. All edits can be undone in the workbench.",
		parameters: {
			id: {
				type: "string",
				required: true
			},
			sceneId: {
				type: "string",
				required: true
			},
			revision: {
				type: "string",
				required: true
			},
			raw: { type: "string" },
			note: { type: "string" },
			elementId: { type: "string" },
			element: { type: "json" }
		},
		output,
		presentCall: (args) => present("修改当前分镜", args),
		execute: async (args, exec) => json(await service.save(requests.save.parse({
			...args,
			origin: "ai"
		}), exec.signal))
	})), "explainroo: edit tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "explainroo_rename",
		description: "Rename a scene or narration cue, including Chinese names, as one validated transaction. Updates script.md, drawing references, cover and manual edits, preserving valid cached speech. Never use a translated display-name map. kind is scene or marker; marker requires from. Requires latest revision; locked scenes are protected. Shared/dynamic references which cannot be safely rewritten are rejected.",
		parameters: {
			id: {
				type: "string",
				required: true
			},
			revision: {
				type: "string",
				required: true
			},
			sceneId: {
				type: "string",
				required: true
			},
			kind: {
				type: "string",
				required: true,
				enum: ["scene", "marker"]
			},
			from: { type: "string" },
			to: {
				type: "string",
				required: true
			}
		},
		output,
		presentCall: (args) => present("重命名场景或触发点", args),
		execute: async (args, exec) => json(await service.rename({
			...args,
			origin: "ai"
		}, exec.signal))
	})), "explainroo: rename tool");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "explainroo_validate",
		description: "Validate scene functions, narration cue references, duplicate names, manual timing overrides and cover references after editing project files. Static analysis only: no TTS, no project JavaScript execution. ok=false includes file/line diagnostics; unresolved dynamic definitions are not reported as verified. Run after Agent file changes before claiming completion.",
		parameters: { id: {
			type: "string",
			required: true
		} },
		output,
		presentCall: (args) => present("验证场景引用", args),
		execute: async (args, exec) => json(await service.validate(args, exec.signal))
	})), "explainroo: validate tool");
	ctx.inject(["jobs"], (jobCtx) => {
		jobCtx.effect(() => jobCtx.tools.register(defineTool({
			name: "explainroo_run",
			description: "Start voice, check, sheet or render as a native Harness background job. render automatically prepares missing/stale voice and may incur configured MiMo/ElevenLabs charges; only run on explicit video export requests. sheet exports silently without TTS; check requires cached voice. Render includes saved visual edits and returns an output file. Use job_output(wait=true) or job_kill for completion/cancellation.",
			parameters: {
				id: {
					type: "string",
					required: true
				},
				action: {
					type: "string",
					required: true,
					enum: [
						"voice",
						"check",
						"sheet",
						"render"
					]
				}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: {
						kind: {
							type: "string",
							required: true,
							const: "background"
						},
						jobId: {
							type: "string",
							required: true
						}
					}
				},
				render: (_args, value) => [{
					type: "text",
					text: `started background job ${value.jobId}`
				}]
			},
			presentCall: (args) => present("视频生成任务", args),
			execute: async (args, exec) => {
				const request = requests.task.parse(args);
				await service.workbench.ready;
				exec.signal.throwIfAborted();
				return {
					kind: "background",
					jobId: jobCtx.jobs.start({
						kind: "explainroo",
						label: `${request.action}: ${request.id}`,
						...exec.agent ? { owner: exec.agent.session.id } : {},
						run: (handle) => {
							let taskId;
							let cancelled = false;
							return {
								done: (async () => {
									try {
										taskId = (await service.workbench.tasks.start(request.id, request.action)).id;
										if (cancelled) await service.workbench.tasks.cancel(taskId);
										const result = await service.workbench.tasks.wait(taskId);
										handle.append(result.log);
										return {
											status: result.status === "completed" ? "completed" : result.status === "cancelled" ? "killed" : "failed",
											result: JSON.stringify(result)
										};
									} catch (error) {
										return {
											status: "failed",
											result: error instanceof Error ? error.message : String(error)
										};
									}
								})(),
								cancel: () => {
									cancelled = true;
									if (taskId) service.workbench.tasks.cancel(taskId);
								}
							};
						}
					})
				};
			}
		})), "explainroo: native background job tool");
	});
}
//#endregion
//#region src/host/workbench-skill.ts
const workbenchSkill = {
	name: "explainroo-workbench",
	source: "runtime",
	description: "在 Explainroo 工作台用中文场景名和触发点创作、修改、预览和导出讲解视频。",
	invocation: {
		modelInvocable: true,
		userInvocable: true
	},
	content: `# Explainroo 工作台

先用 explainroo_setup 读取引擎与项目库，以 @当前项目 的真实 folder 为准。一个工作台可有多个项目，不要混写。新建由工作台初始化零场景项目和 .dsh/skills/explainroo；不要再次 init。创作前阅读项目 workspaceSkill 指定的 SKILL.md、场景 API 和示例，缺少指引时从当前引擎路径查找随插件提供的 skill。

场景名与触发点直接支持中文，例如 ## 开场介绍、[#认识账户]，scenes.js 对象键和 at: '#认识账户' 使用同名。不存在独立中文显示名或翻译字典。中文新项目优先用有意义的中文；不自动翻译既有英文项目。

explainroo_project 返回最新 revision、锁定和手动调整。explainroo_edit_scene 修改单场；场景或触发点改名使用 explainroo_rename，统一更新引用，禁止只改标题或盲目全文替换。锁定不能由 AI 解开。每场都写 note 分镜说明，概括构图、对象关系、动画顺序和旁白标记；先保存绘图文件，再读取最新 revision，逐场写 note 并沿用每次返回的新 revision，不将说明混入旁白。

Agent 直接修改 script.md、scenes.js 或其辅助模块后，必须运行 explainroo_validate({id})，或 node ".dsh/skills/explainroo/scripts/validate.mjs" "<项目目录>"。只有 ok: true / 退出码 0 才通过；按 file、line、scene 修复悬空引用与重名。无法静态确认的动态定义不能声称已验证。此检查不执行项目代码、不生成配音；仍需查看无声预览检查实际画面。已有工作区 skill 若仍要求英文名称，以本段中文支持规则为准；中文 ID 和 MiMo 由插件兼容层处理，不能直接使用原版 CLI。旧工作区脚本可能仍直连旧引擎，优先使用 Host 工具；不修改共享引擎。

工作台保存后自动刷新无声预览。render 导出视频内部补齐配音，sheet 不生成配音；仅在用户明确要求时用 explainroo_run 执行配音或导出，使用 job_output(wait=true) 查看结果，启动不等于完成。不要发送自动对话或打印凭据。`
};
//#endregion
//#region src/index.ts
const name = "dsh-explainroo";
function apply(ctx, config) {
	const service = new ExplainrooService(ctx, config);
	ctx.inject(["tools"], (toolsCtx) => registerTools(toolsCtx, service));
	ctx.inject(["skills"], (skillCtx) => skillCtx.effect(() => skillCtx.get("skills").register(workbenchSkill), "explainroo: native creation guide"));
}
//#endregion
export { Config, apply, name };
