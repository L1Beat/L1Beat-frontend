interface TypographyProps {
  theme: 'dark' | 'light';
}

export function Typography({ theme }: TypographyProps) {
  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-3xl mb-3">Typography</h2>
        <p className="text-muted-foreground max-w-3xl">
          Our typography system prioritizes clarity and readability while maintaining a modern, technical aesthetic suitable for data analytics.
        </p>
      </div>

      {/* Primary Typeface */}
      <section>
        <h3 className="mb-6">Primary Typeface</h3>
        <div className="p-8 rounded-xl border border-border bg-card">
          <div className="mb-8">
            <div className="text-5xl mb-4">System UI</div>
            <p className="text-muted-foreground">
              San Francisco (macOS), Segoe UI (Windows), Roboto (Android)
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="mb-4">Why System Fonts?</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Fast loading - no web font downloads</li>
                <li>• Native feel on every platform</li>
                <li>• Excellent legibility at all sizes</li>
                <li>• Designed for screens and interfaces</li>
                <li>• Professional and modern appearance</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4">Font Stack</h4>
              <code className="block p-4 rounded-lg bg-muted text-sm break-all">
                system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
              </code>
            </div>
          </div>
        </div>
      </section>

      {/* Type Scale */}
      <section>
        <h3 className="mb-6">Type Scale</h3>
        <div className="space-y-4">
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-5xl">Display Large</div>
              <code className="text-sm text-muted-foreground">3rem / 48px</code>
            </div>
            <p className="text-muted-foreground">Hero sections, landing pages</p>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-4xl">Display Medium</div>
              <code className="text-sm text-muted-foreground">2.25rem / 36px</code>
            </div>
            <p className="text-muted-foreground">Page titles, major sections</p>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between mb-2">
              <h1>Heading 1</h1>
              <code className="text-sm text-muted-foreground">1.5rem / 24px</code>
            </div>
            <p className="text-muted-foreground">Primary headings</p>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between mb-2">
              <h2>Heading 2</h2>
              <code className="text-sm text-muted-foreground">1.25rem / 20px</code>
            </div>
            <p className="text-muted-foreground">Secondary headings</p>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between mb-2">
              <h3>Heading 3</h3>
              <code className="text-sm text-muted-foreground">1.125rem / 18px</code>
            </div>
            <p className="text-muted-foreground">Tertiary headings</p>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between mb-2">
              <p>Body Text</p>
              <code className="text-sm text-muted-foreground">1rem / 16px</code>
            </div>
            <p className="text-muted-foreground">Default body copy, paragraphs, descriptions</p>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-sm">Small Text</div>
              <code className="text-sm text-muted-foreground">0.875rem / 14px</code>
            </div>
            <p className="text-muted-foreground">Captions, metadata, helper text</p>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-xs">Extra Small</div>
              <code className="text-sm text-muted-foreground">0.75rem / 12px</code>
            </div>
            <p className="text-muted-foreground">Labels, tags, fine print</p>
          </div>
        </div>
      </section>

      {/* Font Weights */}
      <section>
        <h3 className="mb-6">Font Weights</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="text-2xl mb-4" style={{ fontWeight: 400 }}>Regular (400)</div>
            <p className="text-muted-foreground mb-4">
              Used for body text, paragraphs, and most interface elements.
            </p>
            <code className="text-sm">font-weight: 400</code>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="text-2xl mb-4" style={{ fontWeight: 500 }}>Medium (500)</div>
            <p className="text-muted-foreground mb-4">
              Used for headings, buttons, labels, and emphasis.
            </p>
            <code className="text-sm">font-weight: 500</code>
          </div>
        </div>
        
        <div className="mt-6 p-6 rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/5">
          <h4 className="mb-2">Usage Guidelines</h4>
          <ul className="space-y-2 text-muted-foreground">
            <li>• Use Regular (400) for body text to maintain readability</li>
            <li>• Use Medium (500) for headings and UI elements that need emphasis</li>
            <li>• Avoid using bold (700+) as it doesn't match our minimal aesthetic</li>
            <li>• The logo wordmark always uses Medium (500)</li>
          </ul>
        </div>
      </section>

      {/* Line Height & Spacing */}
      <section>
        <h3 className="mb-6">Line Height & Spacing</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl border border-border bg-card">
            <h4 className="mb-4">Line Height</h4>
            <div className="space-y-4">
              <div>
                <div className="mb-2">Headings</div>
                <code className="block p-3 rounded bg-muted text-sm">line-height: 1.2</code>
                <p className="text-sm text-muted-foreground mt-2">Tight line height for visual impact</p>
              </div>
              <div>
                <div className="mb-2">Body Text</div>
                <code className="block p-3 rounded bg-muted text-sm">line-height: 1.5</code>
                <p className="text-sm text-muted-foreground mt-2">Comfortable reading experience</p>
              </div>
            </div>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <h4 className="mb-4">Letter Spacing</h4>
            <div className="space-y-4">
              <div>
                <div className="mb-2">Logo & Large Text</div>
                <code className="block p-3 rounded bg-muted text-sm">letter-spacing: -0.01em</code>
                <p className="text-sm text-muted-foreground mt-2">Slightly tighter for better visual cohesion</p>
              </div>
              <div>
                <div className="mb-2">Body & UI Text</div>
                <code className="block p-3 rounded bg-muted text-sm">letter-spacing: normal</code>
                <p className="text-sm text-muted-foreground mt-2">Default spacing for optimal legibility</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Text Colors */}
      <section>
        <h3 className="mb-6">Text Colors</h3>
        <div className="space-y-4">
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="mb-1">Primary Text</h4>
                <p className="text-muted-foreground">Main content, headings, important information</p>
              </div>
              <code className="text-sm">{theme === 'dark' ? '#ffffff' : '#0f172a'}</code>
            </div>
            <div className="text-xl">The quick brown fox jumps over the lazy dog</div>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="mb-1">Secondary Text</h4>
                <p className="text-muted-foreground">Supporting information, metadata, descriptions</p>
              </div>
              <code className="text-sm">#71717a</code>
            </div>
            <div className="text-xl text-muted-foreground">The quick brown fox jumps over the lazy dog</div>
          </div>
          
          <div className="p-6 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="mb-1">Accent Text</h4>
                <p className="text-muted-foreground">Links, interactive elements, emphasis</p>
              </div>
              <code className="text-sm">#ef4444</code>
            </div>
            <div className="text-xl" style={{ color: '#ef4444' }}>The quick brown fox jumps over the lazy dog</div>
          </div>
        </div>
      </section>

      {/* Examples in Context */}
      <section className="p-8 rounded-xl border border-border bg-card">
        <h3 className="mb-6">Typography in Context</h3>
        <div className="max-w-3xl space-y-6">
          <div>
            <h1 className="mb-2">Avalanche L1 Analytics Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor network performance, track validator activity, and analyze transaction patterns across all Avalanche L1 blockchains in real-time.
            </p>
          </div>
          
          <div>
            <h2 className="mb-3">Network Statistics</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Total Value Locked</div>
                <div className="text-2xl" style={{ color: '#ef4444' }}>$2.4B</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">Active Validators</div>
                <div className="text-2xl" style={{ color: '#ef4444' }}>1,247</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="text-xs text-muted-foreground mb-1">TPS</div>
                <div className="text-2xl" style={{ color: '#ef4444' }}>4,523</div>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="mb-2">Recent Activity</h3>
            <p className="text-sm text-muted-foreground">
              Latest transactions and events across the network
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
