import { a as readCompatibility, d as upstreamModules, f as voiceChunks, g as mimoSynthesize, l as previewData } from "./preview-DIMaN2lS.js";
import { join, relative } from "node:path";
import { mkdir } from "node:fs/promises";
//#region src/host/voice.ts
/** Runs only inside an explicitly requested voice/render task's owned worker. */
async function prepareExternalVoice(root, folder, original, log) {
	const manifest = await readCompatibility(folder);
	if (manifest?.voice.provider !== "mimo") return;
	const engine = await upstreamModules(root);
	const project = engine.loadProject(folder);
	const target = join(folder, project.config.voice.src);
	await mkdir(target, { recursive: true });
	const voice = manifest.voice;
	for (const scene of project.script.scenes) {
		if (manifest.cached.includes(scene.id)) continue;
		const chunks = voiceChunks(engine, scene, project.config);
		if (!chunks.length) continue;
		const pieces = [];
		for (const chunk of chunks) {
			if (chunk.gapBefore) pieces.push(new Float32Array(Math.round(chunk.gapBefore * 24e3)));
			const audio = await mimoSynthesize({
				dir: original,
				text: chunk.text,
				voice: voice.id,
				model: voice.model,
				host: voice.host,
				style: voice.style,
				speed: manifest.tempo,
				build: join(folder, "build")
			});
			pieces.push(engine.trimSilence(audio.audio, audio.sampling_rate));
		}
		const samples = new Float32Array(pieces.reduce((length, piece) => length + piece.length, 0));
		let cursor = 0;
		for (const piece of pieces) {
			samples.set(piece, cursor);
			cursor += piece.length;
		}
		const file = join(target, scene.id + ".wav");
		engine.writeWav(file, samples, 24e3);
		log(`MiMo ${manifest.identities.scenes[scene.id] ?? scene.id}: 已生成外部音频`);
	}
}
//#endregion
//#region src/host/export-worker.ts
const [root, folder, action, original, workers = "2"] = process.argv.slice(2);
try {
	const engine = await upstreamModules(root);
	const manifest = await readCompatibility(folder);
	for (const key of [
		"MIMO_TTS_API_KEY",
		"MIMO_API_KEY",
		"ELEVENLABS_API_KEY"
	]) {
		const value = engine.findEnv(key, original, root);
		if (value) process.env[key] = value;
	}
	if (!process.env.MIMO_TTS_API_KEY && process.env.MIMO_API_KEY) process.env.MIMO_TTS_API_KEY = process.env.MIMO_API_KEY;
	const data = await previewData(root, folder);
	const total = data.project.script.scenes.length;
	const voiced = new Set(data.cached);
	const progress = (percent, phase) => process.stdout.write(`@explainroo-progress ${JSON.stringify({
		progress: percent,
		phase
	})}\n`);
	const log = (line) => {
		if (/^rendering /.test(line)) progress(35, "render");
		if (/^frames done/.test(line)) progress(95, "render");
		const voice = /^voice (\S+):/.exec(line);
		if (voice) {
			voiced.add(voice[1]);
			progress(Math.round(35 * voiced.size / total), "voice");
		}
		const frames = /frames (\d+)\/(\d+)/.exec(line);
		if (frames) progress(35 + Math.round(60 * Number(frames[1]) / Number(frames[2])), "render");
		let readable = line;
		for (const [ascii, original] of Object.entries({
			...manifest?.identities.scenes,
			...manifest?.identities.markers
		})) if (ascii !== original) readable = readable.split(ascii).join(original);
		process.stdout.write(readable + "\n");
	};
	await mkdir(join(folder, "out"), { recursive: true });
	const project = engine.loadProject(folder);
	if (action === "voice" || action === "render") await prepareExternalVoice(root, folder, original, log);
	if (action === "voice") {
		progress(0, "voice");
		await engine.prepare(project, { log });
		progress(100, "finished");
	} else if (action === "check") {
		if (data.cached.size !== total) throw new Error("旁白缓存已失效，请先显式生成配音。");
		const report = await engine.check(project, { log });
		for (const issue of report.issues) log(`${issue.level.toUpperCase()} ${issue.scene ?? ""}: ${issue.message}`);
		if (report.issues.some((issue) => issue.level === "error")) throw new Error("画面检查未通过。");
		progress(100, "finished");
	} else if (action === "sheet") {
		progress(15, "sheet");
		await engine.ensureFonts(project.config.language, { log });
		const times = data.timeline.scenes.map((scene) => scene.start + Math.max(0, scene.dur - .12));
		const labels = data.timeline.scenes.map((scene) => manifest?.identities.scenes[scene.id] ?? scene.id);
		const file = join(folder, "out", "storyboard.jpg");
		await engine.withEngine(project, data.timeline, {
			scale: .5,
			log
		}, (page) => page.evaluate((options) => window.explainroo.sheet(options), {
			times,
			labels,
			cols: Math.min(total, total > 20 ? 6 : total > 9 ? 5 : 4),
			thumb: data.timeline.width >= data.timeline.height ? 320 : 200,
			path: relative(folder, file).replaceAll("\\", "/")
		}));
		progress(100, "finished");
	} else if (action === "render") {
		progress(voiced.size === total ? 35 : Math.round(35 * voiced.size / total), voiced.size === total ? "render" : "voice");
		await engine.render(project, {
			workers: Number(workers),
			out: join(folder, "out", "video.mp4"),
			log
		});
		progress(100, "finished");
	} else throw new Error("不支持的任务类型。");
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
setTimeout(() => process.exit(process.exitCode ?? 0), 5e3).unref();
//#endregion
export {};
