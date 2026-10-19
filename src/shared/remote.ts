import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { actionSchema, appearanceSchema, newProjectSchema, patchSchema, stages, voiceSettingsSchema } from './types.ts';

export const requests = {
  setup: z.object({}),
  configure: z.object({ libraryRoot: z.string().optional(), engineRoot: z.string().optional() }),
  inspectFolder: z.object({ folder: z.string().min(1) }),
  createProject: newProjectSchema,
  installSkill: z.object({ id: z.string().min(1) }),
  project: z.object({ id: z.string().min(1) }),
  save: z.object({ id: z.string().min(1), sceneId: z.string().min(1), revision: z.string().min(1), raw: z.string().max(100000).optional(), note: z.string().max(10000).optional(), locked: z.boolean().optional(), elementId: z.string().max(200).optional(), element: z.object({ kind: z.string(), baseText: z.string(), patch: patchSchema }).optional(), origin: z.enum(['ai', 'user']).default('user') }),
  rename: z.object({ id: z.string().min(1), revision: z.string().min(1), sceneId: z.string().min(1), kind: z.enum(['scene', 'marker']), from: z.string().min(1).optional(), to: z.string().trim().min(1).max(160), origin: z.enum(['ai', 'user']).default('user') }),
  validate: z.object({ id: z.string().min(1) }),
  stage: z.object({ id: z.string(), revision: z.string(), stage: z.enum(stages) }),
  appearance: z.object({ id: z.string().min(1), revision: z.string().min(1), appearance: appearanceSchema }),
  voiceSettings: z.object({ id: z.string().min(1), revision: z.string().min(1), voice: voiceSettingsSchema }),
  history: z.object({ id: z.string(), revision: z.string(), direction: z.enum(['undo', 'redo']) }),
  task: z.object({ id: z.string(), action: actionSchema }),
  tasks: z.object({ id: z.string() }),
  cancel: z.object({ taskId: z.string() }),
  download: z.object({ taskId: z.string().min(1) }),
};
export type RemoteMethod = keyof typeof requests;
const codec = (symbol: string, schema: z.ZodType) => ({ mode: 'strict' as const, typeSymbol: `dsh-explainroo#${symbol}`, create: () => schema });
export const invocations: readonly InvocationDescriptor[] = Object.entries(requests).map(([method, request]) => ({
  id: `dsh-explainroo#explainroo/${method}`, service: 'explainroo', namespace: 'explainroo', method,
  invocation: { kind: 'direct' as const },
  parameters: [{ name: 'request', wire: 'request', source: 'json' as const, codec: codec(`${method}Request`, request) }],
  cancellation: { parameter: 'signal' }, result: codec(`${method}Result`, z.json()),
  sourceLocation: { file: 'src/service.ts', line: 1, column: 1 },
}));
export const remote: TypertRemoteContribution = { package: 'dsh-explainroo', descriptors: invocations };
