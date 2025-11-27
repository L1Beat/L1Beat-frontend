import { Download, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { L1BeatLogo } from './L1BeatLogo';

interface DownloadAssetsProps {
  theme: 'dark' | 'light';
}

export function DownloadAssets({ theme }: DownloadAssetsProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = (code: string, label: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(label);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const reactCode = `import { L1BeatLogo } from './components/L1BeatLogo';

// Basic usage
<L1BeatLogo />

// With options
<L1BeatLogo 
  size="medium"      // small | medium | large
  theme="dark"       // dark | light
  iconOnly={false}   // true for icon only
  variant="primary"  // primary | header
/>`;

  const htmlCode = `<!-- Dark theme with full logo -->
<img src="/logo-dark.svg" alt="L1Beat" height="40" />

<!-- Light theme with full logo -->
<img src="/logo-light.svg" alt="L1Beat" height="40" />

<!-- Dark theme icon only -->
<img src="/icon-dark.svg" alt="L1Beat" width="40" height="40" />

<!-- Animated version -->
<img src="/logo-dark-animated.svg" alt="L1Beat" height="40" />`;

  const markdownCode = `<!-- Dark theme -->
![L1Beat](https://l1beat.io/logo-dark.svg)

<!-- Light theme (GitHub README) -->
![L1Beat](https://l1beat.io/logo-light.svg)

<!-- Animated version -->
![L1Beat](https://l1beat.io/logo-dark-animated.svg)

<!-- With size specification -->
<img src="https://l1beat.io/logo-dark.svg" alt="L1Beat" height="60" />`;

  const assets = [
    {
      category: 'Full Logo',
      items: [
        { name: 'logo-dark.svg', description: 'Dark theme, static', path: '/logo-dark.svg' },
        { name: 'logo-dark-animated.svg', description: 'Dark theme, animated pulse', path: '/logo-dark-animated.svg' },
        { name: 'logo-light.svg', description: 'Light theme, static', path: '/logo-light.svg' },
        { name: 'logo-light-animated.svg', description: 'Light theme, animated pulse', path: '/logo-light-animated.svg' },
      ]
    },
    {
      category: 'Icon Only',
      items: [
        { name: 'icon-dark.svg', description: 'Icon for dark backgrounds', path: '/icon-dark.svg' },
        { name: 'icon-dark-animated.svg', description: 'Animated icon, dark theme', path: '/icon-dark-animated.svg' },
        { name: 'icon-light.svg', description: 'Icon for light backgrounds', path: '/icon-light.svg' },
        { name: 'icon-light-animated.svg', description: 'Animated icon, light theme', path: '/icon-light-animated.svg' },
      ]
    },
    {
      category: 'Favicon',
      items: [
        { name: 'favicon.svg', description: 'Static favicon', path: '/favicon.svg' },
        { name: 'favicon-animated.svg', description: 'Animated favicon with pulse', path: '/favicon-animated.svg' },
      ]
    }
  ];

  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-3xl mb-3">Download Assets</h2>
        <p className="text-muted-foreground max-w-3xl">
          All logo assets are available in SVG format for perfect scaling and small file sizes. Choose between static and animated versions for different use cases.
        </p>
      </div>

      {/* Asset Files */}
      {assets.map(({ category, items }) => (
        <section key={category}>
          <h3 className="mb-6">{category}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            {items.map(({ name, description, path }) => (
              <div key={name} className="p-6 rounded-xl border border-border bg-card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h4 className="mb-1">{name}</h4>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </div>
                  <a
                    href={path}
                    download={name}
                    className="px-4 py-2 rounded-lg bg-[#ef4444] text-white hover:bg-[#dc2626] transition-colors flex items-center gap-2 shrink-0 ml-4"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </a>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 flex items-center justify-center min-h-[80px]">
                  <img src={path} alt={name} className="max-h-[60px]" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* React Component */}
      <section>
        <h3 className="mb-6">React Component</h3>
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h4 className="mb-2">L1BeatLogo Component</h4>
              <p className="text-muted-foreground">
                Fully customizable React component with props for size, theme, and variant options. Includes built-in animations.
              </p>
            </div>
            <button
              onClick={() => copyCode(reactCode, 'react')}
              className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-2 shrink-0"
            >
              {copiedCode === 'react' ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 rounded-lg bg-muted overflow-x-auto">
            <code className="text-sm">{reactCode}</code>
          </pre>
          
          <div className="mt-6 pt-6 border-t border-border">
            <h4 className="mb-4">Live Preview</h4>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-6 rounded-lg bg-muted/50 flex flex-col items-center gap-3">
                <L1BeatLogo size="small" theme={theme} />
                <code className="text-xs text-muted-foreground">size="small"</code>
              </div>
              <div className="p-6 rounded-lg bg-muted/50 flex flex-col items-center gap-3">
                <L1BeatLogo size="medium" theme={theme} />
                <code className="text-xs text-muted-foreground">size="medium"</code>
              </div>
              <div className="p-6 rounded-lg bg-muted/50 flex flex-col items-center gap-3">
                <L1BeatLogo size="medium" iconOnly theme={theme} />
                <code className="text-xs text-muted-foreground">iconOnly={'{'}true{'}'}</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HTML Usage */}
      <section>
        <h3 className="mb-6">HTML Usage</h3>
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h4 className="mb-2">Static HTML</h4>
              <p className="text-muted-foreground">
                Use SVG files directly in HTML with img tags. Perfect for static sites and simple implementations.
              </p>
            </div>
            <button
              onClick={() => copyCode(htmlCode, 'html')}
              className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-2 shrink-0"
            >
              {copiedCode === 'html' ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 rounded-lg bg-muted overflow-x-auto">
            <code className="text-sm">{htmlCode}</code>
          </pre>
        </div>
      </section>

      {/* Markdown Usage */}
      <section>
        <h3 className="mb-6">Markdown Usage</h3>
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h4 className="mb-2">GitHub README & Documentation</h4>
              <p className="text-muted-foreground">
                Use in README files, documentation, and other markdown content. Choose light theme for better visibility on GitHub.
              </p>
            </div>
            <button
              onClick={() => copyCode(markdownCode, 'markdown')}
              className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors flex items-center gap-2 shrink-0"
            >
              {copiedCode === 'markdown' ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 rounded-lg bg-muted overflow-x-auto">
            <code className="text-sm">{markdownCode}</code>
          </pre>
        </div>
      </section>

      {/* File Specifications */}
      <section className="p-8 rounded-xl border border-border bg-card">
        <h3 className="mb-6">File Specifications</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="mb-4">Technical Details</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span>Format</span>
                <code className="text-sm">SVG</code>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span>Viewbox</span>
                <code className="text-sm">48×48</code>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span>Color Space</span>
                <code className="text-sm">RGB</code>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span>File Size</span>
                <code className="text-sm">~2-4 KB</code>
              </div>
            </div>
          </div>
          <div>
            <h4 className="mb-4">Recommended Usage</h4>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-[#ef4444]/20 flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
                </div>
                <div>
                  <strong className="text-foreground">Animated versions</strong> for website headers and digital applications
                </div>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-[#ef4444]/20 flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
                </div>
                <div>
                  <strong className="text-foreground">Static versions</strong> for email signatures and print materials
                </div>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full bg-[#ef4444]/20 flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
                </div>
                <div>
                  <strong className="text-foreground">Icon versions</strong> for favicons, app icons, and social media profiles
                </div>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}