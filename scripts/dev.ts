import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { defaults } from '../src/config.ts';
import { Workbench } from '../src/service.ts';
import { requests, type RemoteMethod } from '../src/shared/remote.ts';

const args = process.argv.slice(2);
const flag = (name: string) => { const index = args.indexOf('--' + name); return index < 0 ? undefined : args[index + 1]; };
const config = defaults(); config.dataDir = resolve(flag('data-dir') ?? '.local/dev');
const workbench = new Workbench(config); await workbench.ready;
if (flag('library') || flag('engine')) await workbench.invoke('configure', { libraryRoot: flag('library') ? resolve(flag('library')!) : undefined, engineRoot: flag('engine') ? resolve(flag('engine')!) : undefined });
const token = randomBytes(24).toString('hex');
const server = await createServer({
  configFile: false, server: { host: '127.0.0.1', port: Number(flag('port') ?? 4480), strictPort: true },
  plugins: [react(), {
    name: 'explainroo-host',
    transformIndexHtml(html) { return html.replace('</head>', `<script>window.__EXPLAINROO_TOKEN__=${JSON.stringify(token)}</script></head>`); },
    configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) { next(); return; }
        if (req.method !== 'POST' || req.headers['x-explainroo-token'] !== token || (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)) { res.statusCode = 403; res.end(); return; }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const method = req.url.slice(5) as RemoteMethod;
          if (!Object.hasOwn(requests, method)) { res.statusCode = 404; res.end('{}'); return; }
          const chunks: Buffer[] = []; let bytes = 0;
          for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024 * 1024) throw new Error('Request is too large'); chunks.push(chunk); }
          res.end(JSON.stringify(await workbench.invoke(method, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))));
        } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
      });
    },
  }],
});
await server.listen(); server.printUrls();
const close = async () => { await server.close(); await workbench.close(); process.exit(0); };
process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
