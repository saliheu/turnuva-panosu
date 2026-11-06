import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage } from 'node:http';

/**
 * Yerel geliştirmede /api isteklerini Netlify Function ile aynı kodla karşılar.
 * Veriler .yerel-veri klasöründe tutulur. Canlıda Netlify Functions + Blobs kullanılır.
 */
function localApi(env: Record<string, string>): Plugin {
  return {
    name: 'yerel-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const { handleApi } = await server.ssrLoadModule('/server/api.ts');
          const { fileStore } = await server.ssrLoadModule('/server/fileStore.ts');
          const body = await readRaw(req);
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : new Uint8Array(body),
          });
          const response: Response = await handleApi(request, fileStore('.yerel-veri'), {
            ADMIN_PASSWORD: env.ADMIN_PASSWORD,
            SESSION_SECRET: env.SESSION_SECRET,
            secureCookies: false,
          });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          console.error(e);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

function readRaw(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), localApi(env)],
    build: { outDir: 'dist', chunkSizeWarningLimit: 900 },
  };
});
