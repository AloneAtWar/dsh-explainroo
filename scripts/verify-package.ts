import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import semver from 'semver';

const manifest = JSON.parse(await readFile('package.json', 'utf8'));
for (const entry of Object.values(manifest.exports) as string[]) assert(existsSync(entry), `missing export ${entry}`);
assert(existsSync(manifest.dsh.bundle.patch));
assert(manifest.files.includes('skills'));
for (const path of ['SKILL.md', 'scripts/explainroo.mjs', 'references/scene-api.md', 'references/writing-and-visuals.md', 'references/storyboard-notes.md', 'examples/password-storage-zh/scenes.js', 'app/src/voice.js', 'app/engine/runtime.js', 'app/fonts/Inter-400-latin.woff2', 'LICENSE']) assert(existsSync(`skills/explainroo/${path}`), `missing workspace skill resource ${path}`);
assert(existsSync('lib/export-worker.js'));
for (const file of ['app/src/names.js', 'app/src/references.js', 'scripts/validate.mjs', 'references/chinese-names.md']) assert(existsSync(`skills/explainroo/${file}`), `missing Chinese naming/validation resource ${file}`);
const engineManifest = JSON.parse(await readFile('skills/explainroo/app/package.json', 'utf8'));
for (const dependency of Object.keys(engineManifest.dependencies)) assert(manifest.dependencies[dependency], `missing bundled engine dependency ${dependency}`);
assert(!existsSync('skills/explainroo/engine.json'), 'machine-specific engine.json must only be generated in user workspaces');
for (const [name, range] of Object.entries(manifest.peerDependencies) as [string, string][]) {
  if (!name.startsWith('@deepseek-ai/dsh-')) continue;
  assert(semver.satisfies('0.2.1-rc.2', range), `${name} rejects latest prerelease`);
  assert(semver.satisfies('0.2.0-rc.2', range), `${name} rejects Desktop runtime`);
  assert(!Object.hasOwn(manifest.dependencies, name), `${name} must remain a host peer`);
}
const host = await import(new URL('../lib/index.js', import.meta.url).href); assert.equal(host.name, 'dsh-explainroo'); assert.equal(typeof host.apply, 'function');
const require = createRequire(import.meta.url);
let entry: any;
const mounted: string[] = [];
const document = { documentElement: { style: {} }, createElement: () => ({ dataset: {}, textContent: '', remove() { mounted.pop(); } }), head: { appendChild() { mounted.push('style'); } } };
vm.runInNewContext(await readFile('lib/client.js', 'utf8'), {
  window: { __ModuleLoader__: { load(value: unknown) { entry = value; } } }, document,
  localStorage: { getItem: () => null, setItem() {} },
  console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval,
}, { filename: 'lib/client.js' });
assert.equal(entry.id, manifest.name);
const loaded = entry.factory((id: string) => {
  assert(['react', 'react/jsx-runtime'].includes(id), `unsupported Client external ${id}`);
  return require(id);
});
assert.equal(typeof loaded.apply, 'function');
const disposers: Array<() => unknown> = []; const pending: Promise<unknown>[] = [];
let descriptor: any; let registered = false; let remoteMounted = false; let referencesMounted = false;
const context: any = {
  fiber: { state: 1 },
  locale: { register() { return () => {}; }, bind() { return (key: string) => key; } },
  remote: { async $mount() { remoteMounted = true; return async () => { remoteMounted = false; }; } },
  inject(_deps: string[], callback: (ctx: unknown) => void) { callback(context); },
  get(name: string) {
    if (name === 'inputTriggers') return { registerSource(source: any) { assert.equal(source.trigger, '@'); assert.equal(source.name, 'explainroo'); assert.equal(typeof source.codec.serialize, 'function'); referencesMounted = true; return () => { referencesMounted = false; }; } };
    assert.equal(name, 'desktopWorkbenches');
    return { register(value: any, component: unknown) {
      assert.match(value.repository, /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/);
      assert(value.layout.businessWidth >= 0.25 && value.layout.businessWidth <= 0.7);
      assert.equal(typeof component, 'function'); descriptor = value; registered = true;
      return () => { registered = false; };
    } };
  },
  effect(effect: () => unknown) {
    const result = effect();
    if (result && typeof (result as any).then === 'function') pending.push(Promise.resolve(result).then(value => { if (typeof value === 'function') disposers.push(value as () => unknown); }));
    else if (typeof result === 'function') disposers.push(result as () => unknown);
  },
};
loaded.apply(context); await Promise.all(pending);
assert(registered); assert(remoteMounted); assert.notEqual(descriptor.customFrame, true); assert.equal(descriptor.embedded, true);
assert(referencesMounted);
assert.equal(descriptor.repository, manifest.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''));
for (const dispose of disposers.reverse()) await dispose();
assert(!registered); assert(!remoteMounted); assert(!referencesMounted); assert.equal(mounted.length, 0);
await mkdir('.local', { recursive: true });
const report = { version: manifest.version, checkedAt: new Date().toISOString(), harnessTarget: '0.2.1-rc.2', desktopRuntimeRange: '0.2.0-rc.2', exports: Object.keys(manifest.exports), clientLoader: 'passed', nativeDescriptor: 'passed', effectCleanup: 'passed', nativeDesktopInstallation: 'not-assessed-by-this-script' };
await writeFile('.local/package-report.json', JSON.stringify(report, null, 2));
console.log('Package exports, prerelease peer ranges, Host import, Client loader, Desktop descriptor and effect cleanup passed.');
