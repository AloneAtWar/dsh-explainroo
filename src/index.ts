import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.ts';
import { ExplainrooService } from './service.ts';
import { registerTools } from './tools.ts';
import { workbenchSkill, type SkillRegistry } from './host/workbench-skill.ts';
export const name = 'dsh-explainroo';
export { Config };
export function apply(ctx: Context, config: Config): void {
  const service = new ExplainrooService(ctx, config);
  ctx.inject(['tools'], toolsCtx => registerTools(toolsCtx, service));
  ctx.inject(['skills'], skillCtx => skillCtx.effect(() => (skillCtx.get('skills') as SkillRegistry).register(workbenchSkill), 'explainroo: native creation guide'));
}
