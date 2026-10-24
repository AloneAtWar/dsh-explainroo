import { z } from "zod";
//#region src/shared/types.ts
const stages = [
	"plan",
	"script",
	"storyboard",
	"visual",
	"audio",
	"export"
];
const actionSchema = z.enum([
	"voice",
	"check",
	"sheet",
	"render"
]);
const patchSchema = z.object({
	text: z.string().max(4e3).optional(),
	x: z.number().finite().optional(),
	y: z.number().finite().optional(),
	w: z.number().positive().max(2e4).optional(),
	h: z.number().positive().max(2e4).optional(),
	size: z.number().positive().max(500).optional(),
	color: z.string().max(60).optional(),
	at: z.union([z.number().min(-1).max(86400), z.string().max(120)]).optional(),
	out: z.union([z.number().min(0).max(86400), z.string().max(120)]).optional(),
	enter: z.enum([
		"none",
		"fade",
		"rise",
		"pop",
		"draw",
		"zoom",
		"slide-left",
		"slide-right"
	]).optional()
}).strict();
const themes = [
	"paper",
	"clean",
	"chalk",
	"blueprint",
	"midnight",
	"editorial"
];
const appearanceSchema = z.object({
	theme: z.enum(themes).optional(),
	bg: z.string().regex(/^#[\da-f]{6}$/i).optional(),
	background: z.enum([
		"paper",
		"dots",
		"chalk",
		"grid",
		"glow",
		"plain"
	]).optional(),
	captions: z.boolean().optional()
}).strict();
const voiceId = z.string().trim().min(1).max(200);
const voiceSettingsSchema = z.discriminatedUnion("provider", [
	z.object({
		provider: z.literal("mimo"),
		id: voiceId,
		model: voiceId.optional(),
		host: voiceId.optional(),
		style: z.string().max(500).optional()
	}).strict(),
	z.object({
		provider: z.literal("elevenlabs"),
		id: voiceId,
		model: voiceId.optional()
	}).strict(),
	z.object({
		provider: z.literal("kokoro"),
		id: voiceId
	}).strict(),
	z.object({
		provider: z.literal("recording"),
		src: z.string().trim().min(1).max(1e3)
	}).strict()
]);
const studioSchema = z.object({
	version: z.literal(1),
	revision: z.number().int().min(0),
	stage: z.enum(stages),
	appearance: appearanceSchema.optional(),
	scenes: z.record(z.string(), z.object({
		locked: z.boolean(),
		note: z.string().max(1e4),
		elements: z.record(z.string(), z.object({
			baseText: z.string(),
			kind: z.string(),
			patch: patchSchema
		}))
	}))
});
const newProjectSchema = z.object({
	folder: z.string().min(1),
	directory: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i).refine((value) => !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(value), "请使用其他目录名。").optional(),
	title: z.string().trim().min(1).max(120).regex(/^[^\r\n\x00-\x1f]+$/),
	size: z.enum([
		"youtube",
		"vertical",
		"square",
		"instagram"
	]),
	theme: z.enum(themes)
});
//#endregion
export { stages as a, patchSchema as i, appearanceSchema as n, studioSchema as o, newProjectSchema as r, voiceSettingsSchema as s, actionSchema as t };
