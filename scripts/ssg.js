import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Extract first image URL from HTML content
function extractImageFromContent(content) {
    if (!content) return null;

    const patterns = [
        // Priority 1: Direct S3 URLs (clean, no CDN processing)
        /https:\/\/substack-post-media\.s3\.amazonaws\.com\/public\/images\/[a-f0-9-]+_\d+x\d+\.(jpeg|jpg|png|webp)/i,
        // Priority 2: Substack CDN URLs
        /<img[^>]*\ssrc=["'](https:\/\/substackcdn\.com\/[^"']+)["'][^>]*>/i,
        // Priority 3: Any other img src
        /<img[^>]*\ssrc=["']([^"']+)["'][^>]*>/i,
        // Priority 4: Markdown images
        /!\[[^\]]*\]\(([^)]+)\)/,
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[0]) {
            // For S3 pattern, extract just the URL
            if (pattern === patterns[0]) {
                return match[0];
            }
            // For other patterns, use captured group
            return match[1].replace(/["']/g, '').trim();
        }
    }
    return null;
}

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
    const blogPosts = new Map(); // Store blog posts by slug
    try {
        console.log(`Fetching blog posts from ${apiBaseUrl}/api/blog/posts?limit=100`);
        const res = await fetch(`${apiBaseUrl}/api/blog/posts?limit=100`);
        const data = await res.json();
        console.log(`Fetched ${data.data?.length || 0} blog posts`);
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach(post => {
                routes.push(`/blog/${post.slug}`);
                blogPosts.set(post.slug, post);
            });
            console.log(`Added ${data.data.length} blog post routes`);
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

          // Check if this is a blog post route
          const blogSlug = url.match(/^\/blog\/(.+)$/)?.[1];
          const post = blogSlug ? blogPosts.get(blogSlug) : null;

          let helmetHead = '';
          if (post) {
              // For blog posts, generate custom meta tags with extracted image
              const imageUrl = post.imageUrl || extractImageFromContent(post.mainContent || post.content) || 'https://l1beat.io/banner.png';
              const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `https://l1beat.io${imageUrl}`;
              const description = post.excerpt || post.subtitle || '';
              const title = post.title || 'L1Beat - Avalanche L1 Analytics Platform';

              helmetHead = `
                  <title>${title} | L1Beat</title>
                  <meta name="description" content="${description}" />
                  <meta property="og:type" content="article" />
                  <meta property="og:url" content="https://l1beat.io${url}" />
                  <meta property="og:title" content="${title}" />
                  <meta property="og:description" content="${description}" />
                  <meta property="og:image" content="${fullImageUrl}" />
                  <meta property="og:site_name" content="L1Beat" />
                  <meta name="twitter:card" content="summary_large_image" />
                  <meta name="twitter:url" content="https://l1beat.io${url}" />
                  <meta name="twitter:title" content="${title}" />
                  <meta name="twitter:description" content="${description}" />
                  <meta name="twitter:image" content="${fullImageUrl}" />
                  <meta property="tg:image" content="${fullImageUrl}" />
                  <link rel="canonical" href="https://l1beat.io${url}" />
              `;
          } else {
              // Use Helmet tags for non-blog routes
              helmetHead = `
                  ${helmet.title?.toString() || ''}
                  ${helmet.meta?.toString() || ''}
                  ${helmet.link?.toString() || ''}
                  ${helmet.script?.toString() || ''}
              `;
          }

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

