import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EngineSetup } from '../src/client/EngineSetup.tsx';
import { zh } from '../src/client/copy.ts';
import type { SetupInfo } from '../src/shared/types.ts';
import { pluginVersion } from '../src/shared/version.ts';

const setup: SetupInfo = { pluginVersion, engineRoot: '', configuredEngineRoot: '', engineReady: false, libraryRoot: '', projects: [], missing: [], engine: { ready: false, root: '', source: 'dependency', defaultReady: false, expectedVersion: '0.4.1' } };
const t = (key: keyof typeof zh) => zh[key];
describe('engine onboarding instructions', () => {
  it('identifies an old running host as a restart requirement instead of a missing engine', () => {
    const html = renderToStaticMarkup(<EngineSetup setup={{ ...setup, pluginVersion: undefined }} retry={() => {}} t={t}/>);
    expect(html).toContain('更新已安装，请重启 Harness');
    expect(html).toContain('重新检测'); expect(html).not.toContain('Explainroo 引擎尚未就绪');
  });
  it('shows the package download and ordered repair steps when installation is incomplete', () => {
    const html = renderToStaticMarkup(<EngineSetup setup={setup} retry={() => {}} t={t}/>);
    expect(html).toContain('Explainroo 引擎尚未就绪');
    expect(html).toContain('https://github.com/AloneAtWar/dsh-explainroo/releases');
    expect(html).toContain('安装与修复引导'); expect(html).toContain('<ol>');
  });
  it('offers restoring the default only when that engine is actually available', () => {
    const custom = { ...setup, engine: { ...setup.engine!, source: 'custom' as const, defaultReady: true } };
    const render = (value: SetupInfo) => renderToStaticMarkup(<EngineSetup setup={value} useDefault={() => {}} t={t}/>);
    expect(render(custom)).toContain('恢复默认引擎');
    expect(render({ ...custom, engine: { ...custom.engine, defaultReady: false } })).not.toContain('恢复默认引擎');
  });
});
