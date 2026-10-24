import { o as studioSchema, s as voiceSettingsSchema } from "./types-BC8Pku7b.js";
import { _ as Serial, b as readOptional, c as findEngine, i as materializeCompatibility, l as previewData, m as inspectEngine, n as runtimeAsset, o as applyAppearance, p as engineRecoveryMessage, r as completedVoices, s as engineModules, u as sourceRevision, v as atomicWrite, y as digest } from "./preview-DIMaN2lS.js";
import Schema from "@deepseek-ai/schemastery";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createReadStream, existsSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
//#region src/config.ts
const Config = Schema.object({
	libraryRoot: Schema.string().default(join(homedir(), "Videos", "Explainroo")).description("本地视频项目目录"),
	engineRoot: Schema.string().default("").description("explainroo 引擎目录；留空使用插件的固定版本原版依赖"),
	dataDir: Schema.string().default(join(homedir(), ".dsh-explainroo")).description("插件配置目录"),
	nodePath: Schema.string().default("node").description("运行 explainroo 的 Node.js 可执行文件"),
	workers: Schema.number().min(1).max(8).default(2).description("导出渲染并发数")
});
function defaults() {
	return {
		libraryRoot: join(homedir(), "Videos", "Explainroo"),
		engineRoot: "",
		dataDir: join(homedir(), ".dsh-explainroo"),
		nodePath: "node",
		workers: 2
	};
}
//#endregion
//#region src/host/script.ts
function sections(source) {
	const headings = [...source.matchAll(/^##[\t ]+([^\s{]+)[^\r\n]*(?:\r?\n|$)/gm)];
	return headings.map((match, index) => {
		const start = match.index + match[0].length;
		const end = headings[index + 1]?.index ?? source.length;
		return {
			id: match[1],
			start,
			end,
			raw: source.slice(start, end).trim()
		};
	});
}
function replaceScene(source, sceneId, raw) {
	if (/^#{1,2}\s/m.test(raw)) throw new Error("请在场景正文中编辑旁白；不要插入章节标题。");
	const section = sections(source).find((item) => item.id === sceneId);
	if (!section) throw new Error(`场景不存在：${sceneId}`);
	const eol = source.includes("\r\n") ? "\r\n" : "\n";
	return source.slice(0, section.start) + raw.trim().replace(/\r?\n/g, eol) + eol + eol + source.slice(section.end);
}
//#endregion
//#region src/host/workspace.ts
const skillRelative = ".dsh/skills/explainroo";
const writes = new Serial();
async function inspectFolder(path) {
	if (!isAbsolute(path)) throw new Error("请选择目录的绝对路径。");
	const folder = await realpath(path);
	if (!(await lstat(folder)).isDirectory()) throw new Error("请选择文件夹。");
	const entries = await readdir(folder, { withFileTypes: true });
	const files = new Set(entries.filter((item) => item.isFile()).map((item) => item.name));
	let kind = entries.length ? "occupied" : "empty";
	if (files.has("video.json") && files.has("script.md")) kind = "project";
	else if (entries.some((item) => item.isDirectory() && !item.name.startsWith(".") && existsSync(join(folder, item.name, "video.json")) && existsSync(join(folder, item.name, "script.md")))) kind = "library";
	return {
		folder,
		kind,
		entries: entries.map((item) => item.name).slice(0, 12)
	};
}
async function workspaceSkill(folder) {
	let discoveryRoot = folder;
	for (let current = folder;; current = dirname(current)) {
		if (existsSync(join(current, ".git"))) {
			discoveryRoot = current;
			break;
		}
		if (dirname(current) === current) break;
	}
	const path = join(folder, skillRelative, "SKILL.md");
	return {
		path,
		installed: existsSync(path) && (await lstat(path)).isFile(),
		discoveryRoot
	};
}
async function skillFiles(engineRoot) {
	const root = ["../skills/explainroo/", "../../skills/explainroo/"].map((path) => fileURLToPath(new URL(path, import.meta.url))).find((path) => existsSync(join(path, "SKILL.md")));
	if (!root) throw new Error("插件安装包缺少 explainroo skill，请重新安装插件。");
	const files = /* @__PURE__ */ new Map();
	async function collect(dir) {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isSymbolicLink()) throw new Error("Skill 资源不能是符号链接。");
			if (entry.isDirectory()) await collect(path);
			else if (entry.isFile()) files.set(join(skillRelative, relative(root, path)), await readFile(path));
		}
	}
	await collect(root);
	const pluginRoot = resolve(root, "../..");
	files.set(join(skillRelative, "references/upstream-guide.md"), await readFile(join(engineRoot, "AGENTS.md")));
	files.set(join(skillRelative, "UPSTREAM_LICENSE"), await readFile(join(engineRoot, "LICENSE")));
	files.set(join(skillRelative, "engine.json"), JSON.stringify({
		engineRoot,
		pluginRoot
	}, null, 2) + "\n");
	return files;
}
async function writeTree(folder, files) {
	const created = [];
	const directories = [];
	async function directory(path) {
		if (path === folder) return;
		const rel = relative(folder, path);
		if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("目标路径超出项目目录。");
		await directory(dirname(path));
		try {
			await mkdir(path);
			directories.push(path);
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
		const entry = await lstat(path);
		if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("Skill 目录包含链接或非目录文件，已停止安装。");
	}
	try {
		for (const [name, content] of files) {
			const path = resolve(folder, name);
			const rel = relative(folder, path);
			if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("目标路径超出项目目录。");
			await directory(dirname(path));
			await writeFile(path, content, { flag: "wx" });
			created.push([path, content]);
		}
	} catch (error) {
		for (const [path, content] of created.reverse()) try {
			if ((await readFile(path)).equals(Buffer.from(content)) && !(await lstat(path)).isSymbolicLink()) await unlink(path);
		} catch {}
		for (const path of directories.reverse()) try {
			await rmdir(path);
		} catch {}
		throw error;
	}
}
async function createWorkspace(request, engineRoot) {
	const folder = (await inspectFolder(request.folder)).folder;
	return writes.run(folder, async () => {
		if ((await inspectFolder(folder)).kind !== "empty") throw new Error("此目录已包含文件。请选择空目录，已有文件不会被覆盖。");
		const files = await skillFiles(engineRoot);
		files.set("scenes.js", "export default {};\n");
		files.set(".gitignore", ".env\nbuild/\nout/\n.explainroo/runs/\n");
		files.set("script.md", `# ${request.title}\n\n`);
		files.set("video.json", JSON.stringify({
			title: request.title,
			language: "zh",
			size: request.size,
			theme: request.theme,
			fps: 30,
			pace: 1.3,
			captions: true
		}, null, 2) + "\n");
		await writeTree(folder, files);
		return folder;
	});
}
async function createWorkspaceProject(request, engineRoot) {
	const root = (await inspectFolder(request.folder)).folder;
	const container = join(root, "projects");
	const folder = join(container, request.directory);
	return writes.run("workspace:" + root, async () => {
		try {
			await mkdir(container);
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
		const entry = await lstat(container);
		if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("projects 必须是工作台内的真实目录。");
		try {
			await mkdir(folder);
		} catch (error) {
			if (error.code === "EEXIST") throw new Error("此项目目录已存在，请换一个目录名。");
			throw error;
		}
		try {
			await installWorkspaceSkill(root, engineRoot);
			return await createWorkspace({
				...request,
				folder
			}, engineRoot);
		} catch (error) {
			try {
				await rmdir(folder);
			} catch {}
			throw error;
		}
	});
}
async function installWorkspaceSkill(folder, engineRoot) {
	return writes.run(folder, async () => {
		const status = await workspaceSkill(folder);
		if (status.installed) return status;
		if (existsSync(join(folder, skillRelative))) throw new Error("已存在 explainroo skill 目录，请先检查其中的文件；安装不会覆盖它。");
		await writeTree(folder, await skillFiles(engineRoot));
		return workspaceSkill(folder);
	});
}
//#endregion
//#region src/host/transaction.ts
const journalName = ".explainroo/pending-edit.json";
const pending = /* @__PURE__ */ new Map();
async function bytes(file) {
	try {
		return await readFile(file);
	} catch (e) {
		if (e.code === "ENOENT") return null;
		throw e;
	}
}
async function inside(folder, name) {
	if (!/^(?:script\.md|video\.json|(?:[^./\\][^/\\]*\/)*[^./\\][^/\\]*\.m?js|\.explainroo\/(?:studio|history)\.json|build\/voice\/[^/\\]+\.(?:json|wav))$/u.test(name) || name.split("/").some((p) => p === "..")) throw new Error("事务文件路径无效。");
	const target = resolve(folder, name);
	const rel = relative(folder, target);
	if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("事务文件超出项目目录。");
	let probe = target;
	while (true) try {
		if ((await lstat(probe)).isSymbolicLink()) throw new Error("事务文件不能通过链接写入。");
		await realpath(probe);
		break;
	} catch (e) {
		if (e.code !== "ENOENT") throw e;
		probe = dirname(probe);
	}
	const real = await realpath(probe);
	const realRel = relative(await realpath(folder), real);
	if (realRel.startsWith("..") || isAbsolute(realRel)) throw new Error("事务文件链接超出项目目录。");
	return target;
}
function encoded(value) {
	return value?.toString("base64") ?? null;
}
async function rollback(folder, entries) {
	for (const entry of [...entries].reverse()) {
		const target = await inside(folder, entry.name);
		const current = encoded(await bytes(target));
		if (current === entry.before) continue;
		if (current !== entry.after) throw new Error(`修改中断，${entry.name} 又被外部修改；已保留现场，请先恢复该文件。`);
		if (entry.before === null) await unlink(target);
		else await atomicWrite(target, Buffer.from(entry.before, "base64"));
	}
}
async function stableProject(folder) {
	const active = pending.get(folder);
	if (active) {
		await active;
		return stableProject(folder);
	}
	const journal = await bytes(join(folder, journalName));
	if (!journal) return;
	const data = JSON.parse(journal.toString("utf8"));
	if (data.version !== 1 || !Array.isArray(data.entries)) throw new Error("项目恢复记录无效。");
	await rollback(folder, data.entries);
	await unlink(join(folder, journalName));
}
async function writeProjectTransaction(folder, values, expected = {}) {
	await stableProject(folder);
	let finish;
	const done = new Promise((accept) => {
		finish = accept;
	});
	pending.set(folder, done);
	const entries = [];
	try {
		for (const [name, value] of Object.entries(values)) {
			const previous = await bytes(await inside(folder, name));
			if (Object.hasOwn(expected, name) && (previous?.toString("utf8") ?? null) !== expected[name]) throw new Error("文件已被其他窗口或 AI 修改，请刷新后重试。");
			const entry = {
				name,
				before: encoded(previous),
				after: Buffer.from(value).toString("base64")
			};
			if (entry.before !== entry.after) entries.push(entry);
		}
		if (!entries.length) return;
		await atomicWrite(join(folder, journalName), JSON.stringify({
			version: 1,
			entries
		}));
		try {
			for (const entry of entries) {
				const target = await inside(folder, entry.name);
				if (encoded(await bytes(target)) !== entry.before) throw new Error("文件在保存期间被外部修改。");
				await atomicWrite(target, Buffer.from(entry.after, "base64"));
			}
		} catch (error) {
			await rollback(folder, entries);
			throw error;
		}
		await unlink(join(folder, journalName));
	} finally {
		pending.delete(folder);
		finish();
	}
}
//#endregion
//#region src/shared/version.ts
const pluginVersion = "0.8.2";
//#endregion
//#region src/host/projects.ts
const emptyStudio = () => ({
	version: 1,
	revision: 0,
	stage: "storyboard",
	scenes: {}
});
const snapshotSchema = z.object({
	script: z.string(),
	studio: studioSchema,
	files: z.record(z.string(), z.string()).optional(),
	guards: z.record(z.string(), z.string()).optional(),
	voices: z.record(z.string(), z.object({
		json: z.string(),
		wavHash: z.string().nullable()
	})).optional()
});
const historySchema = z.object({
	undo: z.array(snapshotSchema).max(30),
	redo: z.array(snapshotSchema).max(30)
});
var Projects = class Projects {
	config;
	serial = new Serial();
	previewUrl = async () => "";
	isBusy = () => false;
	constructor(config) {
		this.config = config;
	}
	async initialize() {
		const saved = await readOptional(join(this.config.dataDir, "settings.json"));
		if (saved) Object.assign(this.config, z.object({
			libraryRoot: z.string(),
			engineRoot: z.string()
		}).parse(JSON.parse(saved)));
	}
	engineRoot() {
		return findEngine(this.config);
	}
	async configure(request) {
		const next = { ...this.config };
		if (request.libraryRoot !== void 0) {
			if (!isAbsolute(request.libraryRoot)) throw new Error("请选择绝对路径。");
			next.libraryRoot = (await inspectFolder(request.libraryRoot)).folder;
		}
		if (request.engineRoot !== void 0) {
			if (request.engineRoot && !isAbsolute(request.engineRoot)) throw new Error("引擎目录必须是绝对路径。");
			next.engineRoot = request.engineRoot;
			const engine = inspectEngine(next);
			if (!engine.ready) throw new Error(engineRecoveryMessage(engine));
		}
		const setup = await new Projects(next).setup();
		await atomicWrite(join(next.dataDir, "settings.json"), JSON.stringify({
			libraryRoot: next.libraryRoot,
			engineRoot: next.engineRoot
		}, null, 2));
		Object.assign(this.config, next);
		return setup;
	}
	async createProject(request) {
		await engineModules(this.engineRoot());
		const folder = request.directory ? await createWorkspaceProject(request, this.engineRoot()) : await createWorkspace(request, this.engineRoot());
		const setup = await this.configure({ libraryRoot: request.directory ? request.folder : folder });
		const selected = setup.projects.find((item) => item.folder === folder);
		if (!selected) throw new Error("初始化完成，但未能在工作台中找到项目。请刷新。");
		return {
			setup,
			project: await this.get(selected.id)
		};
	}
	async installSkill(id) {
		await engineModules(this.engineRoot());
		return installWorkspaceSkill(await this.folder(id), this.engineRoot());
	}
	async folders() {
		const root = this.config.libraryRoot;
		if (!existsSync(root)) return [];
		const resolvedRoot = await realpath(root);
		const result = [];
		if (existsSync(join(root, "video.json")) && existsSync(join(root, "script.md"))) result.push({
			id: basename(root),
			folder: resolvedRoot
		});
		const scan = async (dir, prefix = "") => {
			if (!existsSync(dir)) return;
			const realDir = await realpath(dir);
			const containerRel = relative(resolvedRoot, realDir);
			if (containerRel.startsWith("..") || isAbsolute(containerRel)) return;
			for (const item of await readdir(dir, { withFileTypes: true })) {
				if (!item.isDirectory() || item.name.startsWith(".") || !existsSync(join(dir, item.name, "video.json")) || !existsSync(join(dir, item.name, "script.md"))) continue;
				const folder = await realpath(join(dir, item.name));
				const rel = relative(resolvedRoot, folder);
				if (rel.startsWith("..") || isAbsolute(rel)) continue;
				result.push({
					id: prefix + item.name,
					folder
				});
			}
		};
		await scan(root);
		await scan(join(root, "projects"), "projects/");
		return result;
	}
	async folder(id) {
		const entry = (await this.folders()).find((item) => item.id === id);
		if (!entry) throw new Error(`找不到项目：${id}`);
		return entry.folder;
	}
	async list() {
		return Promise.all((await this.folders()).map(async ({ id, folder }) => {
			const config = JSON.parse(await readFile(join(folder, "video.json"), "utf8"));
			const script = await readFile(join(folder, "script.md"), "utf8");
			const rawTimeline = await readOptional(join(folder, "build/timeline.json"));
			return {
				id,
				title: String(config.title ?? id),
				folder,
				sceneCount: sections(script).length,
				duration: rawTimeline ? Number(JSON.parse(rawTimeline).duration ?? 0) : 0,
				hasVideo: existsSync(join(folder, "out/video.mp4")) || existsSync(join(folder, "out/video-studio.mp4"))
			};
		}));
	}
	async setup() {
		const engine = inspectEngine(this.config);
		const engineRoot = engine.root;
		const folderState = existsSync(this.config.libraryRoot) ? await inspectFolder(this.config.libraryRoot) : void 0;
		return {
			pluginVersion,
			engine,
			engineRoot,
			configuredEngineRoot: this.config.engineRoot,
			engineReady: engine.ready,
			libraryRoot: this.config.libraryRoot,
			projects: await this.list(),
			missing: engine.ready ? [] : [engineRecoveryMessage(engine)],
			...folderState ? { folderState } : {}
		};
	}
	async snapshot(folder) {
		await stableProject(folder);
		const script = await readFile(join(folder, "script.md"), "utf8");
		const rawState = await readOptional(join(folder, ".explainroo/studio.json"));
		return {
			script,
			studio: rawState ? studioSchema.parse(JSON.parse(rawState)) : emptyStudio()
		};
	}
	async revision(folder, snapshot) {
		return digest(folder + "\0" + snapshot.script + JSON.stringify(snapshot.studio) + await sourceRevision(folder));
	}
	async get(id) {
		const folder = await this.folder(id);
		const snapshot = await this.snapshot(folder);
		const rawSections = sections(snapshot.script);
		const engine = await engineModules(this.engineRoot());
		const { project, timeline, cached } = rawSections.length ? await previewData(this.engineRoot(), folder, snapshot.studio.appearance) : {
			project: {
				config: applyAppearance(engine.normalizeConfig(JSON.parse(await readFile(join(folder, "video.json"), "utf8")), folder), snapshot.studio.appearance),
				script: { title: "" }
			},
			timeline: {
				scenes: [],
				duration: 0
			},
			cached: /* @__PURE__ */ new Set()
		};
		const look = engine.getTheme(project.config.theme, project.config.look);
		const history = await this.readHistory(folder);
		return {
			id,
			title: project.config.title ?? project.script.title ?? id,
			folder,
			sceneCount: timeline.scenes.length,
			duration: timeline.duration,
			hasVideo: existsSync(join(folder, "out/video.mp4")) || existsSync(join(folder, "out/video-studio.mp4")),
			revision: await this.revision(folder, snapshot),
			script: snapshot.script,
			studio: snapshot.studio,
			workspaceSkill: await workspaceSkill(folder),
			width: project.config.width,
			height: project.config.height,
			fps: project.config.fps,
			theme: project.config.theme,
			appearance: {
				theme: project.config.look?.extends ?? project.config.theme,
				bg: look.bg,
				background: look.background,
				captions: project.config.captions,
				custom: !!Object.keys(snapshot.studio.appearance ?? {}).length
			},
			voice: typeof project.config.voice === "string" ? project.config.voice : `${project.config.voice.provider} · ${project.config.voice.provider === "recording" ? project.config.voice.src : project.config.voice.id}`,
			voiceSettings: typeof project.config.voice === "string" ? {
				provider: "kokoro",
				id: project.config.voice
			} : project.config.voice,
			defaultVoice: engine.LANGUAGES[project.config.language],
			language: project.config.language,
			voiceChoices: Object.entries(engine.VOICES).filter(([id]) => engine.voiceLanguage(id) === project.config.language).map(([id, label]) => ({
				id,
				label: String(label)
			})),
			scenes: timeline.scenes.map((scene) => ({
				id: scene.id,
				index: scene.index,
				text: scene.text,
				raw: rawSections.find((item) => item.id === scene.id)?.raw ?? "",
				start: scene.start,
				duration: scene.dur,
				marks: scene.marks,
				cached: cached.has(scene.id)
			})),
			previewUrl: rawSections.length ? await this.previewUrl(id) : "",
			allVoicesCached: timeline.scenes.length > 0 && cached.size === timeline.scenes.length,
			canUndo: history.undo.length > 0,
			canRedo: history.redo.length > 0
		};
	}
	async readHistory(folder) {
		const raw = await readOptional(join(folder, ".explainroo/history.json"));
		return raw ? historySchema.parse(JSON.parse(raw)) : {
			undo: [],
			redo: []
		};
	}
	async wavHash(folder, name) {
		try {
			return createHash("sha256").update(await readFile(join(folder, "build/voice", `${name}.wav`))).digest("hex");
		} catch (e) {
			if (e.code === "ENOENT") return null;
			throw e;
		}
	}
	async captureVoices(folder, names) {
		const result = {};
		for (const name of names) {
			if (!/^[\p{L}\p{M}\p{N}_-]+$/u.test(name)) throw new Error("配音名称无效。");
			const json = await readOptional(join(folder, "build/voice", `${name}.json`));
			if (json) result[name] = {
				json,
				wavHash: await this.wavHash(folder, name)
			};
		}
		return result;
	}
	async writeSnapshot(folder, next, previous, history, audio = {}) {
		const engine = await engineModules(this.engineRoot());
		if (sections(next.script).length) engine.parseScript(next.script, { language: JSON.parse(await readFile(join(folder, "video.json"), "utf8")).language ?? "en" });
		const values = {
			...next.files,
			"script.md": next.script,
			".explainroo/studio.json": JSON.stringify(next.studio, null, 2),
			".explainroo/history.json": JSON.stringify(history),
			...audio
		};
		for (const [name, voice] of Object.entries(next.voices ?? {})) {
			if (!/^[\p{L}\p{M}\p{N}_-]+$/u.test(name)) throw new Error("配音名称无效。");
			const copied = audio[`build/voice/${name}.wav`];
			if ((copied ? createHash("sha256").update(copied).digest("hex") : await this.wavHash(folder, name)) === voice.wavHash) values[`build/voice/${name}.json`] = voice.json;
		}
		const rawStudio = await readOptional(join(folder, ".explainroo/studio.json"));
		if (JSON.stringify(rawStudio ? studioSchema.parse(JSON.parse(rawStudio)) : emptyStudio()) !== JSON.stringify(previous.studio)) throw new Error("画面状态已被其他窗口或 AI 修改，请刷新后重试。");
		await writeProjectTransaction(folder, values, {
			"script.md": previous.script,
			".explainroo/studio.json": rawStudio,
			...next.guards
		});
	}
	assertIdle(id) {
		if (this.isBusy(id)) throw new Error("项目正在执行任务，请等待完成或先取消任务。");
	}
	async setVoice(request) {
		const voice = voiceSettingsSchema.parse(request.voice);
		return this.serial.run(request.id, async () => {
			this.assertIdle(request.id);
			const folder = await this.folder(request.id);
			if (await this.revision(folder, await this.snapshot(folder)) !== request.revision) throw new Error("项目已被其他窗口或 AI 修改。请刷新后再保存；当前输入会保留。");
			const file = join(folder, "video.json");
			const previous = await readFile(file, "utf8");
			const next = {
				...JSON.parse(previous),
				voice
			};
			(await engineModules(this.engineRoot())).normalizeConfig(next, folder);
			if (await this.revision(folder, await this.snapshot(folder)) !== request.revision) throw new Error("项目已被其他窗口或 AI 修改。请刷新后再保存；当前输入会保留。");
			const serialized = JSON.stringify(next, null, 2) + "\n";
			await atomicWrite(file, serialized);
			try {
				return await this.get(request.id);
			} catch (error) {
				if (await readFile(file, "utf8") === serialized) await atomicWrite(file, previous);
				throw error;
			}
		});
	}
	async mutate(id, revision, edit) {
		return this.serial.run(id, async () => {
			this.assertIdle(id);
			const folder = await this.folder(id);
			const previous = await this.snapshot(folder);
			if (await this.revision(folder, previous) !== revision) throw new Error("项目已被其他窗口或 AI 修改。请刷新后再保存；当前输入会保留。");
			const next = structuredClone(previous);
			edit(next);
			next.studio.revision += 1;
			studioSchema.parse(next.studio);
			const engine = await engineModules(this.engineRoot());
			if (sections(next.script).length) engine.parseScript(next.script, { language: JSON.parse(await readFile(join(folder, "video.json"), "utf8")).language ?? "en" });
			const history = await this.readHistory(folder);
			await mkdir(join(folder, ".explainroo"), { recursive: true });
			await this.writeSnapshot(folder, next, previous, {
				undo: [...history.undo, previous].slice(-30),
				redo: []
			});
			return this.get(id);
		});
	}
	async save(request) {
		return this.mutate(request.id, request.revision, (snapshot) => {
			if (!sections(snapshot.script).some((item) => item.id === request.sceneId)) throw new Error("场景不存在。");
			const edit = snapshot.studio.scenes[request.sceneId] ??= {
				locked: false,
				note: "",
				elements: {}
			};
			if (edit.locked && (request.raw !== void 0 || request.note !== void 0 || request.element !== void 0)) throw new Error("该场景已锁定，请先手动解锁。");
			if (request.origin === "ai" && request.locked !== void 0) throw new Error("AI 不能更改用户的锁定状态。");
			if (request.raw !== void 0) snapshot.script = replaceScene(snapshot.script, request.sceneId, request.raw);
			if (request.note !== void 0) edit.note = request.note;
			if (request.locked !== void 0) edit.locked = request.locked;
			if (request.elementId && request.element) edit.elements[request.elementId] = request.element;
		});
	}
	async validate(id) {
		const folder = await this.folder(id);
		await stableProject(folder);
		return (await engineModules(this.engineRoot())).validateProjectReferences(folder);
	}
	async persistVoices(id, revision, values) {
		return this.serial.run(id, async () => {
			const folder = await this.folder(id);
			const snapshot = await this.snapshot(folder);
			if (await this.revision(folder, snapshot) !== revision) return false;
			const guards = {
				...(await engineModules(this.engineRoot())).readProjectModules(folder),
				"script.md": snapshot.script,
				"video.json": await readFile(join(folder, "video.json"), "utf8")
			};
			await writeProjectTransaction(folder, {
				...guards,
				...values
			}, guards);
			return true;
		});
	}
	async rename(request) {
		return this.serial.run(request.id, async () => {
			this.assertIdle(request.id);
			const folder = await this.folder(request.id);
			const previous = await this.snapshot(folder);
			if (await this.revision(folder, previous) !== request.revision) throw new Error("项目已被其他窗口或 AI 修改。请刷新后再改名。");
			const engine = await engineModules(this.engineRoot());
			const target = previous.studio.scenes[request.sceneId];
			if (target?.locked) throw new Error("该场景已锁定，请先手动解锁。");
			const configSource = await readFile(join(folder, "video.json"), "utf8");
			const config = JSON.parse(configSource);
			const sources = engine.readProjectModules(folder);
			const result = engine.renameReferences(previous.script, sources, request, {
				language: config.language ?? "en",
				config,
				studio: previous.studio
			});
			if (request.to === (request.kind === "scene" ? request.sceneId : request.from)) return this.get(request.id);
			const next = {
				script: result.script,
				studio: structuredClone(previous.studio)
			};
			if (request.kind === "scene") {
				if (Object.hasOwn(next.studio.scenes, request.to)) throw new Error("该名称已有保存的场景状态，请先检查后再改名。");
				if (target) {
					next.studio.scenes[request.to] = next.studio.scenes[request.sceneId];
					delete next.studio.scenes[request.sceneId];
				}
				if (typeof config.cover === "string" && config.cover.split("@")[0] === request.sceneId) config.cover = request.to + config.cover.slice(request.sceneId.length);
			} else for (const override of Object.values(next.studio.scenes[request.sceneId]?.elements ?? {})) for (const key of ["at", "out"]) if (override.patch[key] === "#" + request.from) override.patch[key] = "#" + request.to;
			next.studio.revision += 1;
			studioSchema.parse(next.studio);
			const validation = engine.analyzeReferences(next.script, result.sources, {
				language: config.language ?? "en",
				config,
				studio: next.studio
			});
			if (!validation.ok) throw new Error(validation.issues.map((x) => x.message).slice(0, 3).join("\n"));
			const beforeFiles = {};
			const afterFiles = {};
			for (const [file, source] of Object.entries(result.sources)) if (source !== sources[file]) {
				beforeFiles[file] = sources[file];
				afterFiles[file] = source;
			}
			if (JSON.stringify(config) !== JSON.stringify(JSON.parse(configSource))) {
				beforeFiles["video.json"] = configSource;
				afterFiles["video.json"] = JSON.stringify(config, null, 2) + "\n";
			}
			next.files = afterFiles;
			next.guards = beforeFiles;
			const beforeEntry = {
				...previous,
				files: beforeFiles,
				guards: afterFiles
			};
			const oldName = request.sceneId;
			const newName = request.kind === "scene" ? request.to : oldName;
			const voices = await this.captureVoices(folder, [oldName]);
			const cached = voices[oldName];
			const audio = {};
			if (cached) {
				const info = JSON.parse(cached.json);
				const oldScene = engine.parseScript(previous.script, { language: config.language ?? "en" }).scenes.find((s) => s.id === oldName);
				const newScene = validation.script.scenes.find((s) => s.id === newName);
				const loaded = engine.loadProject(folder);
				const chunks = (s) => engine.speechChunks(s.units, {
					sentenceGap: loaded.config.sentenceGap,
					paragraphGap: loaded.config.paragraphGap,
					pace: loaded.config.pace,
					language: loaded.config.language
				});
				if (loaded.config.voice.provider !== "recording" && info.hash === engine.sceneHash(oldScene, chunks(oldScene), loaded.config) && (!info.duration || cached.wavHash)) {
					const marks = { ...info.marks };
					if (request.kind === "marker" && Object.hasOwn(marks, request.from)) {
						marks[request.to] = marks[request.from];
						delete marks[request.from];
					}
					const updated = {
						...info,
						id: newName,
						marks,
						hash: engine.sceneHash(newScene, chunks(newScene), loaded.config)
					};
					beforeEntry.voices = voices;
					next.voices = { [newName]: {
						json: JSON.stringify(updated, null, 2),
						wavHash: cached.wavHash
					} };
					if (newName !== oldName && cached.wavHash) audio[`build/voice/${newName}.wav`] = await readFile(join(folder, "build/voice", `${oldName}.wav`));
				}
			}
			if (config.voice?.provider === "recording" && request.kind === "scene") throw new Error("录音项目改名还需同步录音文件，请先通过 Agent 迁移录音并运行验证。");
			if (await this.revision(folder, await this.snapshot(folder)) !== request.revision) throw new Error("项目已变化，请刷新后重试。");
			const history = await this.readHistory(folder);
			await this.writeSnapshot(folder, next, previous, {
				undo: [...history.undo, beforeEntry].slice(-30),
				redo: []
			}, audio);
			return this.get(request.id);
		});
	}
	async history(id, direction, revision) {
		return this.serial.run(id, async () => {
			this.assertIdle(id);
			const folder = await this.folder(id);
			const current = await this.snapshot(folder);
			if (await this.revision(folder, current) !== revision) throw new Error("项目已变化，请刷新后再撤销。");
			const history = await this.readHistory(folder);
			const next = history[direction].pop();
			if (!next) throw new Error(direction === "undo" ? "没有可撤销的修改。" : "没有可重做的修改。");
			if (next.files) {
				current.files = {};
				for (const file of Object.keys(next.files)) current.files[file] = await readFile(join(folder, file), "utf8");
				current.guards = next.files;
			}
			if (next.voices) current.voices = await this.captureVoices(folder, Object.keys(next.voices));
			history[direction === "undo" ? "redo" : "undo"].push(current);
			await this.writeSnapshot(folder, next, current, history);
			return this.get(id);
		});
	}
};
//#endregion
//#region src/host/tasks.ts
var Tasks = class {
	projects;
	entries = /* @__PURE__ */ new Map();
	downloadServer;
	downloads = /* @__PURE__ */ new Map();
	constructor(projects) {
		this.projects = projects;
		projects.isBusy = (id) => [...this.entries.values()].some((task) => task.info.projectId === id && task.info.status === "running");
	}
	list(id) {
		return [...this.entries.values()].filter((task) => !id || task.info.projectId === id).map((task) => ({ ...task.info })).reverse();
	}
	hasRunning() {
		return [...this.entries.values()].some((task) => task.info.status === "running");
	}
	async start(id, action) {
		return this.projects.serial.run(id, async () => {
			if (this.projects.isBusy(id)) throw new Error("该项目已有任务正在运行。");
			const project = await this.projects.get(id);
			if (!project.sceneCount) throw new Error("请先创建至少一个场景，再生成配音或导出。");
			if (typeof this.projects.validate === "function") {
				const report = await this.projects.validate(id);
				if (!report.ok) throw new Error(report.issues[0]?.message ?? "场景引用验证失败。");
			}
			if (action === "check" && !project.allVoicesCached) throw new Error("部分旁白尚未配音或已修改。");
			const info = {
				id: randomUUID(),
				projectId: id,
				projectTitle: project.title,
				projectFolder: project.folder,
				action,
				status: "running",
				startedAt: Date.now(),
				log: "",
				progress: 0,
				phase: "preparing"
			};
			const running = {
				info,
				revision: project.revision,
				cancelled: false,
				done: Promise.resolve(info)
			};
			this.entries.set(info.id, running);
			for (const [key, task] of this.entries) if (this.entries.size > 40 && task.info.status !== "running") this.entries.delete(key);
			running.done = this.execute(running, project.folder).catch((error) => {
				info.status = running.cancelled ? "cancelled" : "failed";
				info.error = error instanceof Error ? error.message : String(error);
				info.endedAt = Date.now();
				return info;
			});
			return { ...info };
		});
	}
	async wait(taskId) {
		const task = this.entries.get(taskId);
		if (!task) throw new Error("任务不存在。");
		return task.done;
	}
	async download(taskId) {
		const task = this.entries.get(taskId)?.info;
		if (!task || task.status !== "completed" || !task.output || !["render", "sheet"].includes(task.action)) throw new Error("导出文件尚未就绪。");
		const filename = `${(task.projectTitle ?? "video").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 90)}${task.action === "render" ? ".mp4" : "-分镜图.jpg"}`;
		for (const [key, value] of this.downloads) if (value.expiresAt < Date.now()) this.downloads.delete(key);
		const token = randomBytes(24).toString("hex");
		this.downloads.set(token, {
			taskId,
			expiresAt: Date.now() + 6e5
		});
		if (!this.downloadServer) this.downloadServer = new Promise((resolve, reject) => {
			const server = createServer(async (req, res) => {
				try {
					const capability = this.downloads.get((req.url ?? "").slice(1));
					const entry = capability && capability.expiresAt >= Date.now() ? this.entries.get(capability.taskId)?.info : void 0;
					const port = server.address().port;
					if (!["GET", "HEAD"].includes(req.method ?? "") || req.headers.host !== `127.0.0.1:${port}` || !entry?.output || entry.status !== "completed") {
						res.writeHead(404);
						res.end();
						return;
					}
					const path = await realpath(entry.output);
					const root = await realpath(join(entry.projectFolder, ".explainroo", "runs", entry.id));
					const rel = relative(root, path);
					const stat = await lstat(entry.output);
					if (rel.startsWith("..") || isAbsolute(rel) || !stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid export file");
					const name = `${(entry.projectTitle ?? "video").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 90)}${entry.action === "render" ? ".mp4" : "-分镜图.jpg"}`;
					res.writeHead(200, {
						"Content-Type": entry.action === "render" ? "video/mp4" : "image/jpeg",
						"Content-Length": stat.size,
						"Content-Disposition": `attachment; filename="export.${entry.action === "render" ? "mp4" : "jpg"}"; filename*=UTF-8''${encodeURIComponent(name)}`,
						"Cache-Control": "no-store",
						"X-Content-Type-Options": "nosniff"
					});
					if (req.method === "HEAD") res.end();
					else createReadStream(path).on("error", () => res.destroy()).pipe(res);
				} catch {
					if (!res.headersSent) res.writeHead(404);
					res.end();
				}
			});
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => resolve(server));
		});
		return {
			url: `http://127.0.0.1:${(await this.downloadServer).address().port}/${token}`,
			filename
		};
	}
	async cancel(taskId) {
		const task = this.entries.get(taskId);
		if (!task) throw new Error("任务不存在。");
		if (task.info.status !== "running") return { ...task.info };
		task.cancelled = true;
		if (task.child?.pid) {
			if (process.platform === "win32") {
				const killer = spawn("taskkill", [
					"/PID",
					String(task.child.pid),
					"/T",
					"/F"
				], {
					windowsHide: true,
					stdio: "ignore"
				});
				await new Promise((accept) => {
					killer.once("close", () => accept());
					killer.once("error", () => {
						task.child?.kill();
						accept();
					});
				});
			} else try {
				process.kill(-task.child.pid, "SIGTERM");
			} catch {
				task.child.kill("SIGTERM");
			}
		}
		return { ...await task.done };
	}
	async createRenderSnapshot(folder, taskId) {
		if (!/^[A-Za-z0-9_-]+$/.test(taskId)) throw new Error("任务副本名称无效。");
		const root = await realpath(folder);
		for (const name of [".explainroo", ".explainroo/runs"]) {
			const target = join(folder, name);
			await mkdir(target, { recursive: true });
			const rel = relative(root, await realpath(target));
			if ((await lstat(target)).isSymbolicLink() || rel.startsWith("..") || isAbsolute(rel)) throw new Error("任务目录必须位于当前项目中，不能是外部链接。");
		}
		const destination = join(folder, ".explainroo", "runs", taskId);
		await mkdir(destination);
		const snapshot = await this.projects.snapshot(folder);
		await materializeCompatibility(this.projects.engineRoot(), folder, destination, snapshot.studio);
		return destination;
	}
	workerArguments(folder, action, original) {
		return [
			runtimeAsset("export-worker.js"),
			this.projects.engineRoot(),
			folder,
			action,
			original,
			String(this.projects.config.workers)
		];
	}
	async execute(task, folder) {
		const { info } = task;
		const projectPath = await this.createRenderSnapshot(folder, info.id);
		if ((await this.projects.get(info.projectId)).revision !== task.revision) throw new Error("创建兼容副本期间项目已变化，请重试。");
		if (info.action === "check") {
			const snapshot = await previewData(this.projects.engineRoot(), projectPath);
			if (snapshot.cached.size !== snapshot.timeline.scenes.length) throw new Error("创建导出快照期间旁白发生变化，请先生成配音后重试。");
		}
		if (task.cancelled) {
			info.status = "cancelled";
			info.endedAt = Date.now();
			return info;
		}
		const exporting = info.action === "render" || info.action === "sheet";
		const args = this.workerArguments(projectPath, info.action, folder);
		if (exporting) info.output = join(projectPath, "out", info.action === "render" ? "video.mp4" : "storyboard.jpg");
		await new Promise((accept, reject) => {
			const child = spawn(this.projects.config.nodePath, args, {
				cwd: folder,
				shell: false,
				windowsHide: true,
				detached: process.platform !== "win32",
				stdio: [
					"ignore",
					"pipe",
					"pipe"
				]
			});
			task.child = child;
			let pending = "";
			const append = (chunk) => {
				const text = chunk.toString("utf8");
				info.log = (info.log + text).slice(-6e4);
				pending += text;
				const lines = pending.split("\n");
				pending = lines.pop() ?? "";
				for (const line of lines) if (line.startsWith("@explainroo-progress ")) try {
					const data = JSON.parse(line.slice(21));
					if (Number.isFinite(data.progress)) info.progress = Math.max(info.progress ?? 0, Math.min(99, Math.round(data.progress)));
					if ([
						"preparing",
						"voice",
						"render",
						"sheet",
						"finished"
					].includes(data.phase)) info.phase = data.phase;
				} catch {}
			};
			child.stdout?.on("data", append);
			child.stderr?.on("data", append);
			child.once("error", reject);
			child.once("close", (code) => {
				if (task.cancelled || code === 0) accept();
				else {
					const reason = info.log.split("\n").filter((line) => line.trim() && !line.startsWith("@explainroo-progress ")).at(-1);
					reject(/* @__PURE__ */ new Error(`${reason ?? `explainroo ${info.action} 退出码 ${code}`}`));
				}
			});
		});
		if (!task.cancelled && ["voice", "render"].includes(info.action)) {
			const values = await completedVoices(this.projects.engineRoot(), projectPath);
			if (!task.cancelled && !await this.projects.persistVoices(info.projectId, task.revision, values)) info.log += "\n项目已变化，生成的配音保留在任务副本中，未回写原项目。";
		}
		info.status = task.cancelled ? "cancelled" : "completed";
		info.endedAt = Date.now();
		if (!task.cancelled && exporting && !(await lstat(info.output)).isFile()) throw new Error("未生成导出文件。");
		if (!task.cancelled) {
			info.progress = 100;
			info.phase = "finished";
		}
		await mkdir(join(folder, ".explainroo", "logs"), { recursive: true });
		await writeFile(join(folder, ".explainroo", "logs", `${info.id}.log`), info.log);
		return info;
	}
	async close() {
		await Promise.allSettled([...this.entries].filter(([, task]) => task.info.status === "running").map(([id]) => this.cancel(id)));
		if (this.downloadServer) {
			const server = await this.downloadServer;
			server.closeAllConnections();
			await new Promise((resolve) => server.close(() => resolve()));
		}
	}
};
//#endregion
export { defaults as a, Config as i, Projects as n, inspectFolder as r, Tasks as t };
