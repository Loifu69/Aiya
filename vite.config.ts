import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Dev only: serve the Vercel functions in api/*.ts from `npm run dev`, so login and the
// other server features work locally. Server secrets come from .env.local (never committed).
function devApi(): Plugin {
  return {
    name: 'aiya-dev-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '');
      for (const key of ['FIREBASE_SERVICE_ACCOUNT', 'CRON_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
        if (env[key] && !process.env[key]) process.env[key] = env[key];
      }

      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/([a-z-]+)(?:\?.*)?$/);
        if (!match) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.ts`);
          const handler = mod[req.method || 'GET'];
          if (typeof handler !== 'function') {
            res.statusCode = 405;
            return res.end('Method Not Allowed');
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          });
          const response: Response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error('[dev api]', err);
          res.statusCode = 500;
          res.end(String(err));
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), devApi()],
    define: {
      // Short commit id of this build (Vercel sets VERCEL_GIT_COMMIT_SHA); shows which version a device runs
      __AIYA_BUILD__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
