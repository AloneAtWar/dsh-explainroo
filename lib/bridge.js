import { o as validateProjectReferences, t as analyzeReferences, u as parseScript } from "./references-BTFicjDD.js";
import { a as defaults, n as Projects, t as Tasks } from "./tasks-DHSU2mS_.js";
import { c as findEngine, h as MIMO_VOICES } from "./preview-DIMaN2lS.js";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
//#region src/bridge.ts
/** Workspace scripts use the same service and compatibility path as Desktop. */
async function main(args, engineRoot = findEngine(defaults())) {
	const [action, ...rest] = args;
	if (!action || [
		"--help",
		"-h",
		"help"
	].includes(action)) {
		console.log("DSH explainroo: voice | check | sheet | render | validate <project> [--json]\nRead-only upstream commands: doctor | voices | themes | formats | icons");
		return 0;
	}
	if (action === "voices" && rest.includes("--mimo")) {
		console.log(JSON.stringify(MIMO_VOICES));
		return 0;
	}
	if ([
		"doctor",
		"voices",
		"themes",
		"formats",
		"icons"
	].includes(action)) return (await import(pathToFileURL(join(engineRoot, "src/cli.js")).href)).main(args);
	const folder = resolve(rest.find((value) => !value.startsWith("--")) ?? ".");
	if (action === "validate") {
		const { validateProjectReferences } = await import("./references-ydXaA5t4.js");
		const report = validateProjectReferences(folder);
		console.log(JSON.stringify(report, null, 2));
		return report.ok ? 0 : 1;
	}
	if (![
		"voice",
		"check",
		"sheet",
		"render"
	].includes(action) || rest.filter((value) => value.startsWith("--")).some((value) => value !== "--json") || rest.filter((value) => !value.startsWith("--")).length > 1) throw new Error("此入口支持 voice/check/sheet/render/validate <项目> [--json]；尺寸和主题请在项目设置中修改，预览请使用工作台。");
	const projects = new Projects({
		...defaults(),
		libraryRoot: dirname(folder),
		engineRoot,
		nodePath: process.execPath
	});
	const tasks = new Tasks(projects);
	try {
		const started = await tasks.start(basename(folder), action);
		const result = await tasks.wait(started.id);
		if (rest.includes("--json")) console.log(JSON.stringify(result));
		else console.log([
			result.log,
			result.output,
			result.error
		].filter(Boolean).join("\n"));
		return result.status === "completed" ? 0 : 1;
	} finally {
		await tasks.close();
	}
}
//#endregion
export { analyzeReferences, main, parseScript, validateProjectReferences };
