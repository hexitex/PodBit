import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Single source of truth for port FALLBACKS lives in `config/ports.ts`. Vite is plain JS
// at config-load time and can't import the TS module, so we read the same fallback block
// from `config/port-defaults.json` (a tiny JSON file that mirrors PORT_DEFAULTS). The
// runtime source of truth is `.env` — these JSON defaults only fire if env vars are unset.
let portDefaults;
try {
    portDefaults = JSON.parse(readFileSync(resolve(__dirname, '../config/port-defaults.json'), 'utf-8'));
} catch (err) {
    throw new Error(`Failed to load config/port-defaults.json — required by vite.config.js. ${err.message}`);
}

export default defineConfig(({ mode }) => {
  // Load env from parent directory
  const env = loadEnv(mode, '../', '');

  const guiPort = parseInt(env.GUI_PORT, 10) || portDefaults.gui;
  const apiPort = parseInt(env.API_PORT, 10) || portDefaults.api;
  const orchestratorPort = parseInt(env.ORCHESTRATOR_PORT, 10) || portDefaults.orchestrator;
  const host = env.HOST || 'localhost';

  return {
    plugins: [react()],
    define: {
      // Expose orchestrator port to client (URL derived from window.location.hostname at runtime)
      'import.meta.env.VITE_ORCHESTRATOR_PORT': JSON.stringify(orchestratorPort),
    },
    server: {
      host: '0.0.0.0',
      port: guiPort,
      proxy: {
        '/api/activity/stream': {
          target: `http://${host}:${apiPort}`,
          changeOrigin: true,
          // SSE requires no response buffering
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              // Ensure chunked transfer for SSE
              proxyRes.headers['cache-control'] = 'no-cache';
              proxyRes.headers['x-accel-buffering'] = 'no';
            });
          },
        },
        // Must match /api/ (with trailing slash) to avoid proxying GUI routes
        // like /api-registry which start with "/api" but are SPA routes.
        '/api/': {
          target: `http://${host}:${apiPort}`,
          changeOrigin: true,
          timeout: 300000,
          proxyTimeout: 300000,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
