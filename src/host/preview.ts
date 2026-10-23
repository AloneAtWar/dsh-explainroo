import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Projects } from './projects.ts';
import { upstreamModules, previewData } from './engine.ts';
import { materializeCompatibility, previewFingerprint } from './compatibility.ts';
import { digest, Serial } from './files.ts';
import { versionImports } from './compat/references.mjs';

export function runtimeAsset(name: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return existsSync(join(here, 'frame.js')) ? join(here, name) : resolve(here, '../../lib', name);
}
const frameHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0d1421;color:#e9eff7;font:14px system-ui}body{display:flex;align-items:center;justify-content:center}#view{position:relative;max-width:100%;max-height:100%;line-height:0}canvas{display:block;max-width:100%;max-height:100%;object-fit:contain}#selection{position:absolute;pointer-events:none;border:1.5px solid #ffbe56;box-sizing:border-box;display:none}#selection:after{content:'';position:absolute;inset:-3px;border:3px solid #ffbe56;clip-path:polygon(0 0,8px 0,8px 3px,3px 3px,3px 8px,0 8px,0 0,100% 0,100% 8px,calc(100% - 3px) 8px,calc(100% - 3px) 3px,calc(100% - 8px) 3px,calc(100% - 8px) 0,100% 0,100% 100%,calc(100% - 8px) 100%,calc(100% - 8px) calc(100% - 3px),calc(100% - 3px) calc(100% - 3px),calc(100% - 3px) calc(100% - 8px),100% calc(100% - 8px),100% 100%,0 100%,0 calc(100% - 8px),3px calc(100% - 8px),3px calc(100% - 3px),8px calc(100% - 3px),8px 100%,0 100%)}#error{position:absolute;inset:auto 12px 12px;background:#421e25;color:#ffdce2;padding:12px;line-height:1.5;white-space:pre-wrap;display:none}
</style></head><body><div id="view"><canvas id="canvas"></canvas><div id="selection"></div></div><div id="error" role="alert"></div><script type="module" src="/studio/frame.js"></script></body></html>`;

export class Previews {
  private sessions = new Map<string, Promise<{ url: string; close(): Promise<void> }>>();
  constructor(private projects: Projects) {}
  async open(id: string): Promise<string> {
    const folder = await this.projects.folder(id);
    const key = this.projects.engineRoot() + ':' + folder;
    let session = this.sessions.get(key);
    if (!session) {
      session = this.start(folder); this.sessions.set(key, session);
      session.catch(() => this.sessions.delete(key));
    }
    return (await session).url;
  }
  private async start(folder: string) {
    const root = this.projects.engineRoot();
    const engine = await upstreamModules(root);
    const destination = await mkdtemp(join(tmpdir(), 'dsh-explainroo-preview-'));
    const refresh = new Serial(); let signature = ''; let identities = { scenes: {}, markers: {} };
    const getState = () => refresh.run('state', async () => {
      const snapshot = await this.projects.snapshot(folder);
      const revision = await this.projects.revision(folder, snapshot);
      const next = digest(revision + await previewFingerprint(folder));
      if (next !== signature) {
        identities = (await materializeCompatibility(root, folder, destination, snapshot.studio)).identities;
        signature = next;
      }
      const { state } = await previewData(root, destination);
      return { ...state, identities, studio: snapshot.studio, version: signature };
    });
    let upstream: { url: string; close(): Promise<void> };
    try { await getState(); upstream = await engine.startServer({ projectDir: destination, getState }); }
    catch (error) { await rm(destination, { recursive: true, force: true }); throw error; }
    const upstreamUrl = new URL(upstream.url);
    const server = http.createServer(async (req, res) => {
      try {
        const port = (server.address() as { port: number }).port;
        const origin = `http://127.0.0.1:${port}`;
        if (req.headers.host !== `127.0.0.1:${port}` || (req.headers.origin && req.headers.origin !== origin)) { res.writeHead(403); res.end('Forbidden'); return; }
        const url = new URL(req.url ?? '/', origin);
        if (!['GET', 'HEAD'].includes(req.method ?? 'GET')) { res.writeHead(405); res.end(); return; }
        res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
        if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(frameHtml); return; }
        if (url.pathname === '/studio/frame.js' || url.pathname === '/studio/scene-adapter.js') {
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(await readFile(runtimeAsset(url.pathname.endsWith('frame.js') ? 'frame.js' : 'scene-adapter.js'))); return;
        }
        if (url.pathname.startsWith('/project/') && /\.m?js$/i.test(url.pathname)) {
          const file = engine.projectFile(destination, decodeURIComponent(url.pathname.slice(9)));
          if (!file) { res.writeHead(404); res.end(); return; }
          res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(versionImports(await readFile(file, 'utf8'), signature)); return;
        }
        const target = url.pathname + url.search;
        const headers = { ...req.headers, host: upstreamUrl.host }; delete headers.origin;
        const forward = http.request(upstreamUrl.origin + target, { method: req.method, headers }, response => { res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res); });
        forward.on('error', () => { res.writeHead(502); res.end('Preview engine stopped'); }); forward.end();
      } catch (error) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(error instanceof Error ? error.message : String(error)); }
    });
    try { await new Promise<void>((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); }); }
    catch (error) { await upstream.close(); await rm(destination, { recursive: true, force: true }); throw error; }
    const port = (server.address() as { port: number }).port;
    return { url: `http://127.0.0.1:${port}/`, close: async () => { server.closeAllConnections(); await new Promise<void>(accept => server.close(() => accept())); await upstream.close(); await refresh.run('state', () => rm(destination, { recursive: true, force: true })); } };
  }
  async close(): Promise<void> { await Promise.allSettled([...this.sessions.values()].map(async session => (await session).close())); this.sessions.clear(); }
}
