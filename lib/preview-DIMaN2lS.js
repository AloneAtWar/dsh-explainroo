import { c as asciiName, i as references_exports, l as encodeScript, n as compatibleSources, r as readProjectModules, s as versionImports, u as parseScript } from "./references-BTFicjDD.js";
import { createRequire } from "node:module";
import os, { tmpdir } from "node:os";
import path, { dirname, isAbsolute, join, relative, resolve } from "node:path";
import fs, { existsSync, readFileSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ProjectError, normalizeConfig } from "explainroo/src/project.js";
import { setTimeout } from "node:timers/promises";
import { findEnv } from "explainroo/src/env.js";
import { ffmpeg } from "explainroo/src/ffmpeg.js";
import { readWav } from "explainroo/src/wav.js";
import http from "node:http";
//#region src/host/files.ts
function digest(value) {
	return createHash("sha256").update(value).digest("hex").slice(0, 20);
}
async function readOptional(file) {
	try {
		return await readFile(file, "utf8");
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}
async function atomicWrite(file, value) {
	await mkdir(dirname(file), { recursive: true });
	const temporary = `${file}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporary, value, "utf8");
		await rename(temporary, file);
	} finally {
		await rm(temporary, { force: true });
	}
}
var Serial = class {
	pending = /* @__PURE__ */ new Map();
	async run(key, operation) {
		const current = (this.pending.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
		this.pending.set(key, current);
		try {
			return await current;
		} finally {
			if (this.pending.get(key) === current) this.pending.delete(key);
		}
	}
};
//#endregion
//#region src/host/compat/mimo.mjs
const MIMO_MODEL = "mimo-v2.5-tts";
const MIMO_VOICES = [
	"mimo_default",
	"冰糖",
	"茉莉",
	"苏打",
	"白桦",
	"Mia",
	"Chloe",
	"Milo",
	"Dean"
];
const SAMPLE_RATE = 24e3;
function mimoHost(host) {
	const cleaned = String(host || "api.xiaomimimo.com").trim().replace(/\/+$/, "").replace(/^https?:\/\//i, "");
	if (!/^[A-Za-z0-9.-]+(?::\d+)?$/.test(cleaned)) throw new ProjectError("voice.host must be a host name like api.xiaomimimo.com");
	return cleaned;
}
function mimoEndpoint(host) {
	return `https://${mimoHost(host)}/v1/chat/completions`;
}
function buildMimoBody(text, { voice, model = MIMO_MODEL, style } = {}) {
	const messages = [];
	const trimmed = typeof style === "string" ? style.trim() : "";
	if (trimmed) messages.push({
		role: "user",
		content: trimmed
	});
	messages.push({
		role: "assistant",
		content: text
	});
	return {
		model,
		messages,
		audio: {
			format: "mp3",
			voice
		}
	};
}
function apiKey(dir) {
	const key = findEnv("MIMO_TTS_API_KEY", dir);
	if (!key) throw new ProjectError("MiMo needs an API key. Set MIMO_TTS_API_KEY or put MIMO_TTS_API_KEY=... in a .env file in the project or explainroo folder.");
	return key;
}
function unreadable() {
	throw new ProjectError("MiMo returned unreadable audio. Try the voice command again.");
}
function base64ToBytes(b64) {
	const stripped = String(b64 ?? "").trim().replace(/\s/g, "");
	const comma = stripped.indexOf(",");
	const data = stripped.startsWith("data:") && comma !== -1 ? stripped.slice(comma + 1) : stripped;
	const padded = data && data.length % 4 ? data + "=".repeat(4 - data.length % 4) : data;
	if (!padded || padded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) unreadable();
	const bytes = Buffer.from(padded, "base64");
	if (!bytes.length) unreadable();
	return bytes;
}
function extractMimoAudio(resp) {
	const choice = resp?.choices?.[0];
	if (choice?.finish_reason === "content_filter") throw new ProjectError("MiMo blocked the text.");
	if (resp?.error) throw new ProjectError("MiMo could not make the voice. Check voice.id, voice.model and voice.host in video.json.");
	const audio = choice?.message?.audio?.data;
	if (!audio) throw new ProjectError("MiMo returned no audio.");
	return base64ToBytes(audio);
}
async function request(dir, host, body) {
	const key = apiKey(dir);
	const url = mimoEndpoint(host);
	for (let attempt = 0; attempt < 3; attempt++) {
		let res;
		try {
			res = await fetch(url, {
				method: "POST",
				signal: AbortSignal.timeout(12e4),
				headers: {
					"api-key": key,
					Authorization: `Bearer ${key}`,
					"Content-Type": "application/json"
				},
				body: JSON.stringify(body)
			});
		} catch {
			throw new ProjectError("MiMo did not answer. Check your connection and try again.");
		}
		const json = await res.json().catch(() => null);
		if (res.ok) return json ?? {};
		if (res.status === 401 || res.status === 403) throw new ProjectError("MiMo rejected the API key. Set MIMO_TTS_API_KEY or put MIMO_TTS_API_KEY=... in a .env file in the project or explainroo folder.");
		if ((res.status === 429 || res.status >= 500) && attempt < 2) {
			await setTimeout(250 * 2 ** attempt);
			continue;
		}
		throw new ProjectError(res.status === 429 || res.status >= 500 ? "MiMo is busy. Try again in a moment." : "MiMo could not make the voice. Check voice.id, voice.model and voice.host in video.json.");
	}
}
function tempo(speed) {
	const filters = [];
	while (speed < .5) {
		filters.push("atempo=0.5");
		speed /= .5;
	}
	while (speed > 2) {
		filters.push("atempo=2");
		speed /= 2;
	}
	if (speed !== 1) filters.push(`atempo=${speed}`);
	return filters;
}
async function decodeMp3(bytes, { speed = 1, build } = {}) {
	const root = build || os.tmpdir();
	fs.mkdirSync(root, { recursive: true });
	const dir = fs.mkdtempSync(path.join(root, "mimo-"));
	try {
		const mp3 = path.join(dir, "in.mp3");
		const wav = path.join(dir, "out.wav");
		fs.writeFileSync(mp3, Buffer.from(bytes));
		const filters = tempo(speed);
		await ffmpeg([
			"-loglevel",
			"error",
			"-i",
			mp3,
			"-vn",
			"-ac",
			"1",
			"-ar",
			String(SAMPLE_RATE),
			...filters.length ? ["-af", filters.join(",")] : [],
			"-c:a",
			"pcm_s16le",
			wav
		]);
		const decoded = readWav(wav);
		return {
			audio: decoded.samples,
			sampling_rate: decoded.sampleRate
		};
	} catch (e) {
		if (e instanceof ProjectError) throw e;
		if ((e instanceof Error ? e.message : String(e)).includes("could not start")) throw new ProjectError("ffmpeg could not start. Install ffmpeg or set EXPLAINROO_FFMPEG.");
		throw new ProjectError("MiMo returned unreadable audio. Try the voice command again.");
	} finally {
		fs.rmSync(dir, {
			recursive: true,
			force: true
		});
	}
}
async function mimoSynthesize({ dir, text, voice, model, host, style, speed = 1, build } = {}) {
	return decodeMp3(extractMimoAudio(await request(dir, host, buildMimoBody(text, {
		voice,
		model,
		style
	}))), {
		speed,
		build
	});
}
//#endregion
//#region src/host/compat/config.mjs
function normalizeConfig$1(raw, dir) {
	const compatible = { ...raw };
	if (typeof raw.cover === "string" && raw.cover !== "auto" && !/^\d+(\.\d+)?$/.test(raw.cover)) {
		const [id, ...tail] = raw.cover.split("@");
		compatible.cover = [asciiName(id), ...tail].join("@");
	}
	const voice = raw.voice;
	let mimo;
	if (voice?.provider === "mimo") {
		if (Object.keys(voice).some((key) => ![
			"provider",
			"id",
			"model",
			"host",
			"style"
		].includes(key))) throw new Error("MiMo 配音设置包含不支持的字段。");
		if (typeof voice.id !== "string" || !voice.id.trim()) throw new Error("MiMo 需要音色名称。");
		if (voice.model !== void 0 && (typeof voice.model !== "string" || !voice.model.trim())) throw new Error("MiMo 模型名称无效。");
		if (voice.style !== void 0 && (typeof voice.style !== "string" || voice.style.trim().length > 500)) throw new Error("MiMo 风格描述最多 500 字符。");
		mimo = {
			provider: "mimo",
			id: voice.id.trim(),
			model: voice.model?.trim() ?? "mimo-v2.5-tts",
			host: mimoHost(voice.host),
			...voice.style?.trim() ? { style: voice.style.trim() } : {}
		};
		compatible.voice = {
			provider: "recording",
			src: "assets/dsh-narration/"
		};
	}
	const config = normalizeConfig(compatible, dir);
	if (raw.cover !== void 0) config.cover = raw.cover;
	if (mimo) config.voice = mimo;
	return config;
}
function loadProject(dir) {
	dir = path.resolve(dir);
	const config = normalizeConfig$1(JSON.parse(fs.readFileSync(path.join(dir, "video.json"), "utf8")), dir);
	const script = parseScript(fs.readFileSync(path.join(dir, "script.md"), "utf8"), { language: config.language });
	if (!config.title) config.title = script.title || path.basename(dir);
	const build = path.join(dir, "build");
	return {
		dir,
		config,
		script,
		paths: {
			build,
			out: path.join(dir, "out"),
			voice: path.join(build, "voice"),
			scenes: path.join(dir, "scenes.js"),
			script: path.join(dir, "script.md"),
			look: config.look ? path.resolve(dir, config.theme) : null
		}
	};
}
var version = "0.4.1";
//#endregion
//#region src/host/engine-installation.ts
const require = createRequire(import.meta.url);
function dependencyManifest() {
	try {
		return require.resolve("explainroo/package.json");
	} catch {
		return "";
	}
}
function engineFolder(candidate) {
	if (!candidate) return "";
	return [resolve(candidate), resolve(candidate, "app")].find((root) => [
		"src/project.js",
		"engine/runtime.js",
		"bin/explainroo.js"
	].every((file) => existsSync(join(root, file)))) ?? "";
}
function inspectEngine(config, manifest = dependencyManifest()) {
	const installed = manifest ? engineFolder(dirname(manifest)) : "";
	const environment = process.env.EXPLAINROO_HOME ?? "";
	const source = config.engineRoot ? "custom" : environment ? "environment" : "dependency";
	const root = source === "dependency" ? installed : engineFolder(config.engineRoot || environment);
	let version$1;
	if (root) try {
		const value = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
		if (typeof value === "string") version$1 = value;
	} catch {}
	return {
		root,
		source,
		ready: !!root,
		defaultReady: !!installed,
		expectedVersion: version,
		...version$1 ? { version: version$1 } : {}
	};
}
function engineRecoveryMessage(engine) {
	if (engine.source === "custom") return "自定义引擎目录不可用。请在安装引导中使用默认引擎，或重新选择完整的 Explainroo 引擎目录。";
	if (engine.source === "environment") return "EXPLAINROO_HOME 指向的引擎不可用。请更正该环境变量并重启 Harness，或在高级设置选择可用引擎。";
	return "Explainroo 引擎未安装完整。请重新安装插件并重启 Harness，再点击“重新检测”；安装与修复步骤见工作台设置。";
}
function findEngine(config) {
	return inspectEngine(config).root;
}
const engines = /* @__PURE__ */ new Map();
async function upstreamModules(root) {
	if (!root) throw new Error("Explainroo 引擎尚未就绪。请返回工作台设置查看安装与修复引导。");
	let result = engines.get(root);
	if (!result) {
		result = (async () => {
			const modules = await Promise.all([
				"project",
				"script",
				"timeline",
				"voice",
				"pipeline",
				"server",
				"fonts",
				"models",
				"env",
				"render",
				"recordings",
				"wav",
				"qa"
			].map((name) => import(pathToFileURL(join(root, `src/${name}.js`)).href)));
			const themes = await import(pathToFileURL(join(root, "engine/themes.js")).href);
			return Object.assign({}, ...modules, themes);
		})();
		engines.set(root, result);
		result.catch(() => engines.delete(root));
	}
	return result;
}
async function engineModules(root) {
	return {
		...await upstreamModules(root),
		...references_exports,
		parseScript,
		loadProject,
		normalizeConfig: normalizeConfig$1
	};
}
async function sourceRevision(folder) {
	const modules = (await readdir(folder)).filter((name) => /\.(m?js|json)$/.test(name)).sort();
	const sources = Object.fromEntries(await Promise.all(modules.map(async (name) => [name, await readFile(join(folder, name), "utf8")])));
	try {
		Object.assign(sources, readProjectModules(folder));
	} catch {}
	return Object.keys(sources).sort().map((name) => name + ":" + sources[name]).join("\n");
}
function applyAppearance(config, appearance) {
	const next = { ...config };
	if (!appearance) return next;
	if (appearance.theme) {
		next.theme = appearance.theme;
		next.look = null;
	}
	if (appearance.bg || appearance.background) next.look = {
		...next.look ?? {
			extends: next.theme,
			name: "studio-look"
		},
		...appearance.bg ? { bg: appearance.bg } : {},
		...appearance.background ? { background: appearance.background } : {}
	};
	if (appearance.captions !== void 0) next.captions = appearance.captions;
	return next;
}
async function previewData(root, folder, appearance) {
	const engine = await engineModules(root);
	const project = engine.loadProject(folder);
	project.config = applyAppearance(project.config, appearance);
	const voices = {};
	const cached = /* @__PURE__ */ new Set();
	for (const scene of project.script.scenes) {
		const voice = engine.readVoice(project, scene.id);
		if (voice && voice.hash === sourceVoiceHash(engine, project, scene) && (!voice.duration || existsSync(join(folder, "build/voice", `${scene.id}.wav`)))) {
			voices[scene.id] = voice;
			cached.add(scene.id);
			continue;
		}
		const words = [];
		const unitTimes = [];
		let time = 0;
		for (const unit of scene.units) if (unit.type === "word") {
			const duration = Math.max(.12, [...unit.spoken].length / (project.config.language === "zh" ? 4.5 : 13)) / project.config.pace;
			const word = {
				text: unit.display,
				start: time,
				end: time + duration
			};
			words.push(word);
			unitTimes.push(word);
			time += duration;
		} else {
			unitTimes.push(null);
			if (unit.type === "pause") time += unit.sec;
		}
		voices[scene.id] = {
			duration: time,
			words,
			marks: engine.resolveMarks(scene.units, unitTimes),
			chunks: []
		};
	}
	const timeline = engine.buildTimeline(project, voices);
	for (const scene of timeline.scenes) if (!cached.has(scene.id)) scene.voice = null;
	return {
		project,
		timeline,
		cached,
		state: engine.makeState(project, timeline)
	};
}
function voiceChunks(engine, scene, config) {
	return engine.speechChunks(scene.units, {
		sentenceGap: config.sentenceGap,
		paragraphGap: config.paragraphGap,
		pace: config.pace,
		language: config.language
	});
}
function sourceVoiceHash(engine, project, scene) {
	let recording;
	if (project.config.voice.provider === "recording") {
		const recordings = engine.recordingFiles({
			...project,
			script: {
				...project.script,
				scenes: [scene]
			}
		});
		const file = recordings.files[scene.id];
		if (file) recording = {
			content: file.hash,
			scenes: recordings.folder ? null : project.script.scenes.map((item) => item.spoken)
		};
	}
	return engine.sceneHash(scene, voiceChunks(engine, scene, project.config), project.config, recording);
}
//#endregion
//#region src/host/compatibility.ts
const compatibilityFile = ".explainroo/compatibility.json";
async function writeChanged(file, value) {
	const bytes = Buffer.from(value);
	try {
		if ((await readFile(file)).equals(bytes)) return;
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, bytes);
}
async function copyProjectTree(source, target, projectRoot) {
	if (!existsSync(source)) {
		if (existsSync(target)) {
			for (const name of await readdir(target)) if (name !== ".dsh-narration") await rm(join(target, name), {
				recursive: true,
				force: true
			});
		}
		return;
	}
	const root = await realpath(projectRoot);
	async function copy(file, destination, ancestors) {
		const real = await realpath(file);
		const rel = relative(root, real);
		if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("项目素材或录音链接超出项目目录。");
		const stat = await lstat(real);
		if (stat.isDirectory()) {
			if (ancestors.has(real)) throw new Error("项目素材包含循环链接。");
			const next = new Set(ancestors);
			next.add(real);
			await mkdir(destination, { recursive: true });
			if ((await lstat(destination)).isSymbolicLink()) throw new Error("兼容副本目录不能是链接。");
			const entries = await readdir(real);
			for (const entry of await readdir(destination)) if (!entries.includes(entry) && entry !== ".dsh-narration") await rm(join(destination, entry), {
				recursive: true,
				force: true
			});
			for (const entry of entries) await copy(join(real, entry), join(destination, entry), next);
		} else if (stat.isFile()) await writeChanged(destination, await readFile(real));
	}
	await copy(source, target, /* @__PURE__ */ new Set());
}
function mapVoice(info, id, identities, encode) {
	const markers = encode ? Object.fromEntries(Object.entries(identities.markers).map(([ascii, original]) => [original, ascii])) : identities.markers;
	return {
		...info,
		id,
		marks: Object.fromEntries(Object.entries(info.marks ?? {}).map(([name, time]) => [markers[name] ?? name, time]))
	};
}
/** Materializes only project inputs. It never writes to the engine or calls TTS. */
async function materializeCompatibility(root, folder, destination, studio) {
	if (resolve(folder) === resolve(destination)) throw new Error("兼容副本不能覆盖原项目。");
	const engine = await engineModules(root);
	const upstream = await upstreamModules(root);
	const source = await readFile(join(folder, "script.md"), "utf8");
	const raw = JSON.parse(await readFile(join(folder, "video.json"), "utf8"));
	const original = engine.loadProject(folder);
	const { script, identities } = encodeScript(source);
	const modules = compatibleSources(source, readProjectModules(folder), identities, {
		language: original.config.language,
		config: raw,
		studio
	});
	await mkdir(destination, { recursive: true });
	for (const [name, contents] of Object.entries(modules)) await writeChanged(join(destination, name === "scenes.js" ? "studio-source.js" : name), contents);
	for (const name of await readdir(folder)) if (/\.json$/i.test(name) && !name.startsWith(".") && name !== "video.json") await writeChanged(join(destination, name), await readFile(join(folder, name)));
	await copyProjectTree(join(folder, "assets"), join(destination, "assets"), folder);
	const config = applyAppearance(original.config, studio.appearance);
	if (config.look) {
		await writeChanged(join(destination, "studio-look.json"), JSON.stringify(config.look));
		raw.theme = "studio-look.json";
	} else if (studio.appearance?.theme) raw.theme = config.theme;
	if (studio.appearance?.captions !== void 0) raw.captions = studio.appearance.captions;
	const scenes = Object.fromEntries(Object.entries(identities.scenes).map(([ascii, name]) => [name, ascii]));
	if (typeof raw.cover === "string" && scenes[raw.cover.split("@")[0]]) {
		const [name, ...tail] = raw.cover.split("@");
		raw.cover = [scenes[name], ...tail].join("@");
	}
	const mimo = original.config.voice.provider === "mimo";
	if (mimo) {
		raw.voice = {
			provider: "recording",
			src: "assets/.dsh-narration/"
		};
		raw.speed = 1 / original.config.pace;
		await mkdir(join(destination, raw.voice.src), { recursive: true });
	} else if (original.config.voice.provider === "recording") {
		const recordings = upstream.recordingFiles(original);
		if (recordings.folder) for (const [name, entry] of Object.entries(recordings.files)) {
			const extension = entry.file.slice(entry.file.lastIndexOf("."));
			await writeChanged(join(destination, original.config.voice.src, scenes[name] + extension), await readFile(entry.file));
		}
	}
	await writeChanged(join(destination, "script.md"), script);
	await writeChanged(join(destination, "video.json"), JSON.stringify(raw, null, 2));
	await writeChanged(join(destination, "studio-adapter.js"), await readFile(runtimeAsset("scene-adapter.js")));
	await writeChanged(join(destination, "scenes.js"), `import source from './studio-source.js';\nimport {wrapScenes} from './studio-adapter.js';\nconst state=${JSON.stringify(studio)};\nconst identities=${JSON.stringify(identities)};\nexport default wrapScenes(source,()=>globalThis.__explainrooStudio?.state??state,(id,items)=>globalThis.__explainrooStudio?.report(id,items),()=>identities);\n`);
	const compatible = upstream.loadProject(destination);
	const manifest = {
		version: 1,
		identities,
		voice: original.config.voice,
		tempo: original.config.speed * original.config.pace,
		hashes: {},
		cached: []
	};
	for (const scene of original.script.scenes) {
		const ascii = scenes[scene.id];
		const hash = sourceVoiceHash(engine, original, scene);
		manifest.hashes[scene.id] = hash;
		const info = engine.readVoice(original, scene.id);
		if (info?.hash !== hash || info.duration && !existsSync(join(folder, "build/voice", scene.id + ".wav"))) {
			for (const extension of ["json", "wav"]) await rm(join(destination, "build/voice", ascii + "." + extension), { force: true });
			continue;
		}
		const voice = mapVoice(info, ascii, identities, true);
		if (existsSync(join(folder, "build/voice", scene.id + ".wav"))) {
			const wav = await readFile(join(folder, "build/voice", scene.id + ".wav"));
			await writeChanged(join(destination, "build/voice", ascii + ".wav"), wav);
			if (mimo) await writeChanged(join(destination, raw.voice.src, ascii + ".wav"), wav);
		}
		const compatibleScene = compatible.script.scenes.find((item) => item.id === ascii);
		if (mimo && compatibleScene.units.some((unit) => unit.type === "word")) {
			const wav = await readFile(join(destination, raw.voice.src, ascii + ".wav"));
			voice.hash = upstream.sceneHash(compatibleScene, voiceChunks(upstream, compatibleScene, compatible.config), compatible.config, {
				content: createHash("sha256").update(wav).digest("hex"),
				scenes: null
			});
		} else voice.hash = sourceVoiceHash(upstream, compatible, compatibleScene);
		await writeChanged(join(destination, "build/voice", ascii + ".json"), JSON.stringify(voice));
		manifest.cached.push(ascii);
	}
	await writeChanged(join(destination, compatibilityFile), JSON.stringify(manifest));
	return manifest;
}
/** Collect successful voices for a revision-checked transaction in the source. */
async function completedVoices(root, destination) {
	const manifest = JSON.parse(await readFile(join(destination, compatibilityFile), "utf8"));
	const upstream = await upstreamModules(root);
	const project = upstream.loadProject(destination);
	const result = {};
	for (const scene of project.script.scenes) {
		const info = upstream.readVoice(project, scene.id);
		if (!info || info.hash !== sourceVoiceHash(upstream, project, scene)) continue;
		const original = manifest.identities.scenes[scene.id];
		if (!original || !manifest.hashes[original]) continue;
		const voice = {
			...mapVoice(info, original, manifest.identities, false),
			hash: manifest.hashes[original]
		};
		const file = join(destination, "build/voice", scene.id + ".wav");
		if (info.duration && !existsSync(file)) continue;
		if (existsSync(file)) result[`build/voice/${original}.wav`] = await readFile(file);
		result[`build/voice/${original}.json`] = JSON.stringify(voice, null, 2);
	}
	return result;
}
async function previewFingerprint(folder) {
	const values = [];
	async function walk(dir) {
		if (!existsSync(dir)) return;
		for (const name of await readdir(dir)) {
			const file = join(dir, name);
			const stat = await lstat(file);
			if (stat.isDirectory()) await walk(file);
			else values.push(`${relative(folder, file)}:${stat.size}:${stat.mtimeMs}`);
		}
	}
	await walk(join(folder, "assets"));
	await walk(join(folder, "build/voice"));
	return values.sort().join("\n");
}
async function readCompatibility(folder) {
	const source = await readOptional(join(resolve(folder), compatibilityFile));
	return source ? JSON.parse(source) : null;
}
//#endregion
//#region src/host/preview.ts
function runtimeAsset(name) {
	const here = dirname(fileURLToPath(import.meta.url));
	return existsSync(join(here, "frame.js")) ? join(here, name) : resolve(here, "../../lib", name);
}
const frameHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0d1421;color:#e9eff7;font:14px system-ui}body{display:flex;align-items:center;justify-content:center}#view{position:relative;max-width:100%;max-height:100%;line-height:0}canvas{display:block;max-width:100%;max-height:100%;object-fit:contain}#selection{position:absolute;pointer-events:none;border:1.5px solid #ffbe56;box-sizing:border-box;display:none}#selection:after{content:'';position:absolute;inset:-3px;border:3px solid #ffbe56;clip-path:polygon(0 0,8px 0,8px 3px,3px 3px,3px 8px,0 8px,0 0,100% 0,100% 8px,calc(100% - 3px) 8px,calc(100% - 3px) 3px,calc(100% - 8px) 3px,calc(100% - 8px) 0,100% 0,100% 100%,calc(100% - 8px) 100%,calc(100% - 8px) calc(100% - 3px),calc(100% - 3px) calc(100% - 3px),calc(100% - 3px) calc(100% - 8px),100% calc(100% - 8px),100% 100%,0 100%,0 calc(100% - 8px),3px calc(100% - 8px),3px calc(100% - 3px),8px calc(100% - 3px),8px 100%,0 100%)}#error{position:absolute;inset:auto 12px 12px;background:#421e25;color:#ffdce2;padding:12px;line-height:1.5;white-space:pre-wrap;display:none}
</style></head><body><div id="view"><canvas id="canvas"></canvas><div id="selection"></div></div><div id="error" role="alert"></div><script type="module" src="/studio/frame.js"><\/script></body></html>`;
var Previews = class {
	projects;
	sessions = /* @__PURE__ */ new Map();
	constructor(projects) {
		this.projects = projects;
	}
	async open(id) {
		const folder = await this.projects.folder(id);
		const key = this.projects.engineRoot() + ":" + folder;
		let session = this.sessions.get(key);
		if (!session) {
			session = this.start(folder);
			this.sessions.set(key, session);
			session.catch(() => this.sessions.delete(key));
		}
		return (await session).url;
	}
	async start(folder) {
		const root = this.projects.engineRoot();
		const engine = await upstreamModules(root);
		const destination = await mkdtemp(join(tmpdir(), "dsh-explainroo-preview-"));
		const refresh = new Serial();
		let signature = "";
		let identities = {
			scenes: {},
			markers: {}
		};
		const getState = () => refresh.run("state", async () => {
			const snapshot = await this.projects.snapshot(folder);
			const next = digest(await this.projects.revision(folder, snapshot) + await previewFingerprint(folder));
			if (next !== signature) {
				identities = (await materializeCompatibility(root, folder, destination, snapshot.studio)).identities;
				signature = next;
			}
			const { state } = await previewData(root, destination);
			return {
				...state,
				identities,
				studio: snapshot.studio,
				version: signature
			};
		});
		let upstream;
		try {
			await getState();
			upstream = await engine.startServer({
				projectDir: destination,
				getState
			});
		} catch (error) {
			await rm(destination, {
				recursive: true,
				force: true
			});
			throw error;
		}
		const upstreamUrl = new URL(upstream.url);
		const server = http.createServer(async (req, res) => {
			try {
				const port = server.address().port;
				const origin = `http://127.0.0.1:${port}`;
				if (req.headers.host !== `127.0.0.1:${port}` || req.headers.origin && req.headers.origin !== origin) {
					res.writeHead(403);
					res.end("Forbidden");
					return;
				}
				const url = new URL(req.url ?? "/", origin);
				if (!["GET", "HEAD"].includes(req.method ?? "GET")) {
					res.writeHead(405);
					res.end();
					return;
				}
				res.setHeader("Cache-Control", "no-store");
				res.setHeader("Referrer-Policy", "no-referrer");
				if (url.pathname === "/") {
					res.setHeader("Content-Type", "text/html; charset=utf-8");
					res.end(frameHtml);
					return;
				}
				if (url.pathname === "/studio/frame.js" || url.pathname === "/studio/scene-adapter.js") {
					res.setHeader("Content-Type", "text/javascript; charset=utf-8");
					res.end(await readFile(runtimeAsset(url.pathname.endsWith("frame.js") ? "frame.js" : "scene-adapter.js")));
					return;
				}
				if (url.pathname.startsWith("/project/") && /\.m?js$/i.test(url.pathname)) {
					const file = engine.projectFile(destination, decodeURIComponent(url.pathname.slice(9)));
					if (!file) {
						res.writeHead(404);
						res.end();
						return;
					}
					res.setHeader("Content-Type", "text/javascript; charset=utf-8");
					res.end(versionImports(await readFile(file, "utf8"), signature));
					return;
				}
				const target = url.pathname + url.search;
				const headers = {
					...req.headers,
					host: upstreamUrl.host
				};
				delete headers.origin;
				const forward = http.request(upstreamUrl.origin + target, {
					method: req.method,
					headers
				}, (response) => {
					res.writeHead(response.statusCode ?? 502, response.headers);
					response.pipe(res);
				});
				forward.on("error", () => {
					res.writeHead(502);
					res.end("Preview engine stopped");
				});
				forward.end();
			} catch (error) {
				res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
				res.end(error instanceof Error ? error.message : String(error));
			}
		});
		try {
			await new Promise((accept, reject) => {
				server.once("error", reject);
				server.listen(0, "127.0.0.1", accept);
			});
		} catch (error) {
			await upstream.close();
			await rm(destination, {
				recursive: true,
				force: true
			});
			throw error;
		}
		return {
			url: `http://127.0.0.1:${server.address().port}/`,
			close: async () => {
				server.closeAllConnections();
				await new Promise((accept) => server.close(() => accept()));
				await upstream.close();
				await refresh.run("state", () => rm(destination, {
					recursive: true,
					force: true
				}));
			}
		};
	}
	async close() {
		await Promise.allSettled([...this.sessions.values()].map(async (session) => (await session).close()));
		this.sessions.clear();
	}
};
//#endregion
export { Serial as _, readCompatibility as a, readOptional as b, findEngine as c, upstreamModules as d, voiceChunks as f, mimoSynthesize as g, MIMO_VOICES as h, materializeCompatibility as i, previewData as l, inspectEngine as m, runtimeAsset as n, applyAppearance as o, engineRecoveryMessage as p, completedVoices as r, engineModules as s, Previews as t, sourceRevision as u, atomicWrite as v, digest as y };
