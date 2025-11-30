import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
// @ts-ignore - vite-plugin-prerender doesn't have types and needs require
const vitePrerender = require('vite-plugin-prerender');
const Renderer = require('@prerenderer/renderer-puppeteer');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to fetch blog routes
async function getBlogRoutes(apiBaseUrl: string) {
  try {
    // Use fetch (available in Node 18+)
    const response = await fetch(`${apiBaseUrl}/api/blog/posts?limit=1000`);
    if (!response.ok) return [];
    
    const data: any = await response.json();
    // Assuming the API returns { data: [{ slug: '...' }] }
    if (data && Array.isArray(data.data)) {
      return data.data.map((post: any) => `/blog/${post.slug}`);
    }
    return [];
  } catch (e) {
    console.warn('Warning: Could not fetch blog routes for prerendering. Blog SEO tags may not work.');
    console.warn(e);
    return [];
  }
}

export default defineConfig(async ({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env.VITE_API_BASE_URL || 'https://l1beat-backend.onrender.com'; // Fallback if needed

  // Define base routes
  let routesToPrerender = ['/', '/blog', '/acps', '/404'];

  // Only fetch dynamic routes during production build to save time
  if (mode === 'production') {
    console.log('Fetching blog routes for prerendering...');
    const blogRoutes = await getBlogRoutes(apiBaseUrl);
    console.log(`Found ${blogRoutes.length} blog posts to prerender.`);
    routesToPrerender = [...routesToPrerender, ...blogRoutes];
  }

  return {
    plugins: [
      react(),
      vitePrerender({
        // The path to the directory where the build files are generated
        staticDir: path.join(__dirname, 'dist'),
        
        // The list of routes to prerender
        routes: routesToPrerender,

        // The renderer to use (Puppeteer)
        renderer: new Renderer({
          // Wait for the element with id "root" to be rendered
          renderAfterDocumentEvent: 'custom-render-trigger',
          // OR simply wait for a specific amount of time (e.g., 5 seconds) for data to load
          renderAfterTime: 5000, 
          // Optional: Run headless
          headless: true,
        }),
        
        // Post-process the HTML to fix any paths or data
        postProcess(renderedRoute: any) {
          // Replace any localhost references with production URL if necessary
          renderedRoute.html = renderedRoute.html.replace(
            /http:\/\/localhost:\d+/g, 
            'https://l1beat.io'
          );
          return renderedRoute;
        },
      }),
    ],
    publicDir: 'public',
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'chart-vendor': ['chart.js', 'react-chartjs-2'],
          },
        },
      },
      target: 'esnext',
      minify: 'esbuild',
    },
    server: {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    },
  } as any; // Cast to any to avoid UserConfig type mismatch with vite-plugin-prerender
});
