import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaults } from '../src/config.ts';
import { apply } from '../src/index.ts';
import { requests, invocations } from '../src/shared/remote.ts';

describe('latest DSH host contracts', () => {
  it('registers and disposes the native Typert service in a real Cordis context', async () => {
    const root = await mkdtemp(join(tmpdir(), 'explainroo-host-'));
    const ctx = new Context();
    try { apply(ctx, { ...defaults(), dataDir: root, libraryRoot: join(root, 'videos') }); expect(ctx.get('explainroo')).toBeDefined(); }
    finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
  });
  it('exports an invocation descriptor for every UI method with strict input codecs', () => {
    expect(invocations.map(item => item.method).sort()).toEqual(Object.keys(requests).sort());
    expect(() => requests.save.parse({ id: 'demo', sceneId: 'intro', revision: 'x', element: { kind: 'box', baseText: 'x', patch: { x: 'wrong' } } })).toThrow();
  });
});
