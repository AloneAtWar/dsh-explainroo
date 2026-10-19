import { defineConfig } from 'tsdown';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const cssPlugin = {
  name: 'explainroo-inline-css',
  resolveId(id: string, importer?: string) { return /\.css(?:\?inline)?$/.test(id) ? '\0explainroo-css:' + resolve(importer ? dirname(importer) : '.', id.replace(/\?inline$/, '')) + '.mjs' : null; },
  async load(id: string) { if (!id.startsWith('\0explainroo-css:')) return null; return `export default ${JSON.stringify(await readFile(id.slice('\0explainroo-css:'.length, -4), 'utf8'))};`; },
};
const clientExternal = ['react', 'react/jsx-runtime', '@deepseek-ai/cordis', '@deepseek-ai/dsh-api-remotes/client', '@deepseek-ai/dsh-client-connection/client', '@deepseek-ai/dsh-client-locale/client', '@deepseek-ai/dsh-client-ui-workspace/client'];
export default defineConfig([
  { entry: { index: 'src/index.ts', 'typert.host': 'src/typert.host.ts', 'export-worker': 'src/host/export-worker.ts' }, format: 'esm', platform: 'node', target: 'es2023', outDir: 'lib', clean: false, dts: false, fixedExtension: false },
  { entry: { frame: 'src/player/frame.ts', 'scene-adapter': 'src/shared/scene-adapter.ts' }, format: 'esm', platform: 'browser', target: 'es2022', outDir: 'lib', clean: false, dts: false, fixedExtension: false },
  {
    entry: { client: 'src/client/index.tsx' }, format: 'cjs', platform: 'browser', target: 'es2022', outDir: 'lib', clean: false, dts: false, fixedExtension: false,
    plugins: [cssPlugin], deps: { neverBundle: clientExternal, alwaysBundle: (id: string) => clientExternal.includes(id) ? undefined : true, onlyBundle: false },
    outputOptions: { entryFileNames: 'client.js', banner: 'window.__ModuleLoader__.load({ id: "dsh-explainroo", factory: (require) => {', intro: 'var module = {exports:{}};var exports=module.exports;', footer: 'return module.exports; }});' },
  },
]);
