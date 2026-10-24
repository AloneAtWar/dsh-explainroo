import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { engineRecoveryMessage, inspectEngine } from '../src/host/engine-installation.ts';

describe('Explainroo installation discovery and recovery', () => {
  let root: string;
  beforeEach(async () => { vi.stubEnv('EXPLAINROO_HOME', ''); root = await mkdtemp(join(tmpdir(), 'dsh-engine-')); });
  afterEach(async () => { vi.unstubAllEnvs(); await rm(root, { recursive: true, force: true }); });
  async function engine(folder: string) {
    for (const file of ['src/project.js', 'engine/runtime.js', 'bin/explainroo.js', 'package.json']) {
      const dir = file.split('/').slice(0, -1).join('/'); await mkdir(join(folder, dir), { recursive: true });
      await writeFile(join(folder, file), file === 'package.json' ? '{"version":"0.4.1"}' : '');
    }
    return join(folder, 'package.json');
  }
  it('uses the installed dependency without requiring a user-supplied engine path', async () => {
    const folder = join(root, 'installed'); const manifest = await engine(folder);
    expect(inspectEngine({ engineRoot: '' }, manifest)).toMatchObject({ ready: true, source: 'dependency', root: folder, defaultReady: true, version: '0.4.1' });
  });
  it('reports a missing or incomplete dependency with reinstall and restart instructions', async () => {
    for (const manifest of ['', join(root, 'missing/package.json')]) {
      const status = inspectEngine({ engineRoot: '' }, manifest);
      expect(status).toMatchObject({ ready: false, source: 'dependency', root: '', defaultReady: false });
      expect(engineRecoveryMessage(status)).toMatch(/重新安装插件.*重启 Harness/);
    }
  });
  it('offers the default engine when a custom folder is stale, without silently changing the choice', async () => {
    const manifest = await engine(join(root, 'installed'));
    const status = inspectEngine({ engineRoot: join(root, 'removed') }, manifest);
    expect(status).toMatchObject({ ready: false, source: 'custom', root: '', defaultReady: true });
    expect(engineRecoveryMessage(status)).toContain('使用默认引擎');
  });
  it('keeps legacy custom app folders and explicit environment overrides supported', async () => {
    const legacy = join(root, 'legacy'); await engine(join(legacy, 'app'));
    expect(inspectEngine({ engineRoot: legacy }, '')).toMatchObject({ ready: true, source: 'custom', root: join(legacy, 'app') });
    vi.stubEnv('EXPLAINROO_HOME', legacy);
    expect(inspectEngine({ engineRoot: '' }, '')).toMatchObject({ ready: true, source: 'environment', root: join(legacy, 'app') });
    vi.stubEnv('EXPLAINROO_HOME', join(root, 'gone'));
    expect(engineRecoveryMessage(inspectEngine({ engineRoot: '' }, ''))).toContain('EXPLAINROO_HOME');
  });
});
