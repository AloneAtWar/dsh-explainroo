//#region src/shared/identities.ts
const emptyIdentities = () => ({
	scenes: {},
	markers: {}
});
function originalScene(id, identities) {
	return identities.scenes[id] ?? id;
}
function originalCue(value, identities) {
	return typeof value === "string" && value.startsWith("#") ? "#" + (identities.markers[value.slice(1)] ?? value.slice(1)) : value;
}
function engineCue(value, identities) {
	if (typeof value !== "string" || !value.startsWith("#")) return value;
	return "#" + (Object.entries(identities.markers).find(([, original]) => original === value.slice(1))?.[0] ?? value.slice(1));
}
//#endregion
//#region src/shared/scene-adapter.ts
const supported = /* @__PURE__ */ new Set([
	"text",
	"box",
	"circle",
	"icon",
	"image"
]);
/** The same adapter runs in the preview and in a materialized export project. */
function wrapScenes(source, state, report, mapping = emptyIdentities) {
	return Object.fromEntries(Object.entries(source).map(([engineId, draw]) => [engineId, (s) => {
		const identities = mapping();
		const sceneId = originalScene(engineId, identities);
		const elements = [];
		const counts = {};
		const result = draw(new Proxy(s, { get(target, key) {
			if (key === "id") return sceneId;
			const value = Reflect.get(target, key, target);
			if (typeof value !== "function") return value;
			if (!supported.has(String(key))) return value.bind(target);
			return (...args) => {
				const kind = String(key);
				const index = counts[kind] = (counts[kind] ?? 0) + 1;
				const optionIndex = kind === "circle" ? 0 : 1;
				const original = { ...args[optionIndex] ?? {} };
				const baseText = String(kind === "circle" ? original.label ?? "" : args[0] ?? "");
				const id = String(original.id ?? `${kind}:${index}`);
				const override = state().scenes[sceneId]?.elements[id];
				const edit = override?.kind === kind && override.baseText === baseText ? override.patch : {};
				const { text, ...properties } = edit;
				const options = {
					...original,
					...properties
				};
				for (const field of ["at", "out"]) if (options[field] !== void 0) options[field] = engineCue(options[field], identities);
				if (kind === "circle" && (edit.w !== void 0 || edit.h !== void 0)) options.r = Math.min(edit.w ?? edit.h, edit.h ?? edit.w) / 2;
				if (kind === "icon" && (edit.w !== void 0 || edit.h !== void 0)) options.size = edit.w ?? edit.h;
				if (kind === "text" && edit.w !== void 0) options.maxWidth = edit.w;
				if (text !== void 0 && kind !== "image" && kind !== "icon") {
					if (kind === "circle") options.label = text;
					else args[0] = text;
				}
				args[optionIndex] = options;
				const result = value.apply(target, args);
				if (result && typeof result.x === "number" && typeof result.w === "number") {
					let at = 0;
					let out = Infinity;
					try {
						at = target.time(options.at ?? 0);
						if (options.out !== void 0) out = target.time(options.out);
					} catch {}
					const scale = target.ctx.getTransform();
					const a = scale.transformPoint({
						x: result.x - result.w / 2,
						y: result.y - result.h / 2
					});
					const b = scale.transformPoint({
						x: result.x + result.w / 2,
						y: result.y + result.h / 2
					});
					const engineScale = target.engine.scale || 1;
					elements.push({
						id,
						kind,
						baseText,
						text: String(text ?? baseText),
						x: Number(options.x ?? result.x),
						y: Number(options.y ?? result.y),
						w: result.w,
						h: result.h,
						size: Number(options.size ?? 48),
						color: String(options.color ?? "ink"),
						at: originalCue(options.at ?? 0, identities),
						...options.out !== void 0 ? { out: originalCue(options.out, identities) } : {},
						enter: String(options.enter ?? "fade"),
						visible: target.t >= at && target.t <= out,
						screen: {
							x: a.x / engineScale,
							y: a.y / engineScale,
							w: (b.x - a.x) / engineScale,
							h: (b.y - a.y) / engineScale
						}
					});
				}
				return result;
			};
		} }));
		report?.(sceneId, elements);
		return result;
	}]));
}
//#endregion
export { wrapScenes };
