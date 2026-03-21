import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(async ({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env.VITE_API_BASE_URL;
  const l1beatExternalApi = env.VITE_L1BEAT_EXTERNAL_API;

  return {
    define: {
      'process.env': {},
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl),
      'import.meta.env.VITE_L1BEAT_EXTERNAL_API': JSON.stringify(l1beatExternalApi),
    },
    plugins: [
      react(),
    ],
    publicDir: 'public',
    build: {
      rollupOptions: {
        output: {
          manualChunks: process.env.SSR_BUILD ? undefined : {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'chart-vendor': ['chart.js', 'react-chartjs-2'],
          },
        },
      },
      target: 'esnext',
      minify: process.env.SSR_BUILD ? false : 'esbuild',
    },
    ssr: {
      target: 'node',
      noExternal: true,
    },
    server: {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    },
  };
});
