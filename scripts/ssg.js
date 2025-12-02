import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function generate() {
  try {
    // 1. Build Client
    console.log('Building client...');
    await build({
      root,
      build: {
        outDir: 'dist',
        ssrManifest: true,
        emptyOutDir: true,
        rollupOptions: {
          input: 'index.html',
        },
      },
    });

    // 2. Build Server
    console.log('Building server...');
    process.env.SSR_BUILD = 'true';
    await build({
      root,
      build: {
        ssr: 'src/entry-server.tsx',
        outDir: 'dist/server',
        emptyOutDir: true,
        rollupOptions: {
          output: {
            format: 'esm',
          },
        },
      },
    });

    // 3. Load server entry
    const template = await fs.readFile(path.resolve(root, 'dist/index.html'), 'utf-8');
    const { render } = await import(path.resolve(root, 'dist/server/entry-server.js'));

    // 4. Get API URL
    const getApiUrl = async () => {
      // Priority 1: Environment variable (Netlify/CI)
      if (process.env.VITE_API_BASE_URL) {
        return process.env.VITE_API_BASE_URL;
      }
      
      // Priority 2: Local .env file
      try {
        const envContent = await fs.readFile(path.resolve(root, '.env'), 'utf-8');
        const match = envContent.match(/VITE_API_BASE_URL=(.*)/);
        if (match) return match[1].trim();
      } catch (e) {}
      
      return 'https://api.l1beat.io'; // Default fallback
    };
    
    const apiBaseUrl = await getApiUrl();
    console.log('Fetching routes from', apiBaseUrl);
    
    const routes = ['/', '/blog', '/acps', '/404'];

    // Fetch blog posts
    try {
        const res = await fetch(`${apiBaseUrl}/api/blog/posts?limit=1000`);
        const data = await res.json();
        if (data.data) {
            data.data.forEach(post => routes.push(`/blog/${post.slug}`));
        }
    } catch (e) {
        console.error('Failed to fetch blog routes', e);
    }

    // Skip ACP pages for now due to syntax highlighter SSR issues
    // They're technical content viewed by developers who can wait for client-side render
    // We can re-enable once we replace react-syntax-highlighter with a simpler solution
    console.log('Skipping ACP pages pre-rendering (technical content, less SEO critical)');

    // 5. Render
    console.log(`Prerendering ${routes.length} routes...`);
    
    for (const url of routes) {
      try {
          const { html: appHtml, helmet } = render(url, {});
          
          let html = template.replace('<!--app-html-->', appHtml);
          
          // Inject Helmet head tags
          const helmetHead = `
              ${helmet.title?.toString() || ''}
              ${helmet.meta?.toString() || ''}
              ${helmet.link?.toString() || ''}
              ${helmet.script?.toString() || ''}
          `;
          html = html.replace('<!--head-meta-->', helmetHead);

          const filePath = path.resolve(root, 'dist', url === '/' ? 'index.html' : `${url.replace(/^\//, '')}/index.html`);
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.writeFile(filePath, html);
          console.log(`Generated ${url}`);
      } catch (e) {
          console.error(`Error rendering ${url}:`, e);
      }
    }
    
    // Cleanup server build
    // await fs.rm(path.resolve(root, 'dist/server'), { recursive: true, force: true });
    console.log('SSG Build Complete!');
    
  } catch (e) {
    console.error('Build failed:', e);
    process.exit(1);
  }
}

generate();

