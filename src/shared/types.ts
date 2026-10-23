import { z } from 'zod';

export const stages = ['plan', 'script', 'storyboard', 'visual', 'audio', 'export'] as const;
export const actionSchema = z.enum(['voice', 'check', 'sheet', 'render']);
export type TaskAction = z.infer<typeof actionSchema>;
export const patchSchema = z.object({
  text: z.string().max(4000).optional(), x: z.number().finite().optional(), y: z.number().finite().optional(),
  w: z.number().positive().max(20000).optional(), h: z.number().positive().max(20000).optional(),
  size: z.number().positive().max(500).optional(), color: z.string().max(60).optional(),
  at: z.union([z.number().min(-1).max(86400), z.string().max(120)]).optional(),
  out: z.union([z.number().min(0).max(86400), z.string().max(120)]).optional(),
  enter: z.enum(['none', 'fade', 'rise', 'pop', 'draw', 'zoom', 'slide-left', 'slide-right']).optional(),
}).strict();
export type ElementPatch = z.infer<typeof patchSchema>;
export const themes = ['paper', 'clean', 'chalk', 'blueprint', 'midnight', 'editorial'] as const;
export const textures = ['paper', 'dots', 'chalk', 'grid', 'glow', 'plain'] as const;
export const appearanceSchema = z.object({
  theme: z.enum(themes).optional(), bg: z.string().regex(/^#[\da-f]{6}$/i).optional(),
  background: z.enum(textures).optional(), captions: z.boolean().optional(),
}).strict();
export type Appearance = z.infer<typeof appearanceSchema>;
const voiceId = z.string().trim().min(1).max(200);
export const voiceSettingsSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('mimo'), id: voiceId, model: voiceId.optional(), host: voiceId.optional(), style: z.string().max(500).optional() }).strict(),
  z.object({ provider: z.literal('elevenlabs'), id: voiceId, model: voiceId.optional() }).strict(),
  z.object({ provider: z.literal('kokoro'), id: voiceId }).strict(),
  z.object({ provider: z.literal('recording'), src: z.string().trim().min(1).max(1000) }).strict(),
]);
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;
export interface ElementOverride { baseText: string; kind: string; patch: ElementPatch }
export interface SceneEdit {
  locked: boolean;
  note: string;
  elements: Record<string, ElementOverride>;
}
export interface StudioState { version: 1; revision: number; stage: typeof stages[number]; appearance?: Appearance; scenes: Record<string, SceneEdit> }
export const studioSchema: z.ZodType<StudioState> = z.object({
  version: z.literal(1), revision: z.number().int().min(0), stage: z.enum(stages),
  appearance: appearanceSchema.optional(),
  scenes: z.record(z.string(), z.object({
    locked: z.boolean(), note: z.string().max(10000),
    elements: z.record(z.string(), z.object({ baseText: z.string(), kind: z.string(), patch: patchSchema })),
  })),
});
export interface SceneInfo { id: string; index: number; text: string; raw: string; start: number; duration: number; cached: boolean; marks: Record<string, number> }
export interface ProjectSummary { id: string; title: string; folder: string; sceneCount: number; duration: number; hasVideo: boolean }
export interface ProjectDetail extends ProjectSummary {
  revision: string; script: string; width: number; height: number; fps: number;
  theme: string; voice: string; scenes: SceneInfo[]; studio: StudioState; previewUrl: string; allVoicesCached: boolean; canUndo: boolean; canRedo: boolean;
  appearance: { theme: string; bg: string; background: string; captions: boolean; custom: boolean };
  workspaceSkill?: WorkspaceSkill;
  voiceSettings?: VoiceSettings;
  defaultVoice?: string;
  language?: string;
  voiceChoices?: Array<{ id: string; label: string }>;
}
export interface WorkspaceSkill { path: string; installed: boolean; discoveryRoot: string }
export interface FolderInspection { folder: string; kind: 'empty' | 'project' | 'library' | 'occupied'; entries: string[] }
export const newProjectSchema = z.object({ folder: z.string().min(1), directory: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/i).refine(value => !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(value), '请使用其他目录名。').optional(), title: z.string().trim().min(1).max(120).regex(/^[^\r\n\x00-\x1f]+$/), size: z.enum(['youtube', 'vertical', 'square', 'instagram']), theme: z.enum(themes) });
export type NewProjectRequest = z.infer<typeof newProjectSchema>;
export interface EditableElement {
  id: string; kind: string; baseText: string; text: string; x: number; y: number; w: number; h: number;
  size: number; color: string; at: number | string; out?: number | string; enter: string;
  visible: boolean; screen: { x: number; y: number; w: number; h: number };
}
export interface TaskInfo { id: string; projectId: string; action: TaskAction; status: 'running' | 'completed' | 'failed' | 'cancelled'; log: string; startedAt: number; endedAt?: number; output?: string; error?: string }
export interface SetupInfo { engineRoot: string; configuredEngineRoot?: string; engineReady: boolean; libraryRoot: string; projects: ProjectSummary[]; missing: string[]; folderState?: FolderInspection }
export interface EditRequest {
  id: string; sceneId: string; revision: string; raw?: string; note?: string; locked?: boolean;
  elementId?: string; element?: ElementOverride; origin?: 'user' | 'ai';
}
export interface RenameRequest { id: string; revision: string; sceneId: string; kind: 'scene' | 'marker'; from?: string; to: string; origin?: 'user' | 'ai' }
export interface ValidationReport { ok: boolean; scenes: number; references: number; issues: Array<{ code: string; message: string; file?: string; line?: number; scene?: string }> }
export interface WorkbenchApi {
  setup(): Promise<SetupInfo>;
  configure(request: { libraryRoot?: string; engineRoot?: string }): Promise<SetupInfo>;
  inspectFolder(request: { folder: string }): Promise<FolderInspection>;
  createProject(request: NewProjectRequest): Promise<{ setup: SetupInfo; project: ProjectDetail }>;
  installSkill(request: { id: string }): Promise<WorkspaceSkill>;
  project(request: { id: string }): Promise<ProjectDetail>;
  save(request: EditRequest): Promise<ProjectDetail>;
  rename(request: RenameRequest): Promise<ProjectDetail>;
  validate(request: { id: string }): Promise<ValidationReport>;
  stage(request: { id: string; stage: typeof stages[number]; revision: string }): Promise<ProjectDetail>;
  appearance(request: { id: string; revision: string; appearance: Appearance }): Promise<ProjectDetail>;
  voiceSettings(request: { id: string; revision: string; voice: VoiceSettings }): Promise<ProjectDetail>;
  history(request: { id: string; direction: 'undo' | 'redo'; revision: string }): Promise<ProjectDetail>;
  task(request: { id: string; action: TaskAction }): Promise<TaskInfo>;
  tasks(request: { id: string }): Promise<TaskInfo[]>;
  cancel(request: { taskId: string }): Promise<TaskInfo>;
  download(request: { taskId: string }): Promise<{ url: string; filename: string }>;
}
export interface TaskInfo { projectTitle?: string; projectFolder?: string }
export interface TaskInfo { progress?: number; phase?: 'preparing' | 'voice' | 'render' | 'sheet' | 'finished' }
