import { L1BeatLogo } from './L1BeatLogo';

interface LogoShowcaseProps {
  theme: 'dark' | 'light';
}

export function LogoShowcase({ theme }: LogoShowcaseProps) {
  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-3xl mb-3">Logo Variations</h2>
        <p className="text-muted-foreground max-w-3xl">
          The L1Beat logo combines a heartbeat waveform with network nodes, symbolizing the continuous monitoring of Avalanche L1 activity. Available in multiple sizes and configurations.
        </p>
      </div>

      {/* Size Variations */}
      <section>
        <h3 className="mb-6">Size Variations</h3>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-8 rounded-xl border border-border bg-card flex flex-col items-center gap-4">
            <L1BeatLogo size="small" theme={theme} />
            <div className="text-center">
              <div className="mb-1">Small</div>
              <code className="text-sm text-muted-foreground">24px height</code>
            </div>
          </div>
          <div className="p-8 rounded-xl border border-border bg-card flex flex-col items-center gap-4">
            <L1BeatLogo size="medium" theme={theme} />
            <div className="text-center">
              <div className="mb-1">Medium</div>
              <code className="text-sm text-muted-foreground">40px height</code>
            </div>
          </div>
          <div className="p-8 rounded-xl border border-border bg-card flex flex-col items-center gap-4">
            <L1BeatLogo size="large" theme={theme} />
            <div className="text-center">
              <div className="mb-1">Large</div>
              <code className="text-sm text-muted-foreground">56px height</code>
            </div>
          </div>
        </div>
      </section>

      {/* Icon Only */}
      <section>
        <h3 className="mb-6">Icon Variations</h3>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6">
          <div className="p-8 rounded-xl border border-border bg-card flex flex-col items-center gap-4">
            <L1BeatLogo size="small" iconOnly theme={theme} />
            <code className="text-sm text-muted-foreground">Small Icon</code>
          </div>
          <div className="p-8 rounded-xl border border-border bg-card flex flex-col items-center gap-4">
            <L1BeatLogo size="medium" iconOnly theme={theme} />
            <code className="text-sm text-muted-foreground">Medium Icon</code>
          </div>
          <div className="p-8 rounded-xl border border-border bg-card flex flex-col items-center gap-4">
            <L1BeatLogo size="large" iconOnly theme={theme} />
            <code className="text-sm text-muted-foreground">Large Icon</code>
          </div>
        </div>
      </section>

      {/* Theme Variations */}
      <section>
        <h3 className="mb-6">Theme Variations</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-12 rounded-xl border border-border" style={{ backgroundColor: '#0a0a0a' }}>
            <div className="flex flex-col items-center gap-6">
              <L1BeatLogo size="large" theme="dark" />
              <div className="text-center">
                <div className="mb-1" style={{ color: '#ffffff' }}>Dark Theme</div>
                <code className="text-sm" style={{ color: '#71717a' }}>
                  Primary use case
                </code>
              </div>
            </div>
          </div>
          <div className="p-12 rounded-xl border border-border" style={{ backgroundColor: '#ffffff' }}>
            <div className="flex flex-col items-center gap-6">
              <L1BeatLogo size="large" theme="light" />
              <div className="text-center">
                <div className="mb-1" style={{ color: '#0f172a' }}>Light Theme</div>
                <code className="text-sm" style={{ color: '#71717a' }}>
                  Alternative option
                </code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logo Anatomy */}
      <section className="p-8 rounded-xl border border-border bg-card">
        <h3 className="mb-6">Logo Anatomy</h3>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <div className="mb-6 p-8 rounded-xl bg-muted/50 flex items-center justify-center">
              <L1BeatLogo size="large" theme={theme} />
            </div>
            <h4 className="mb-3">Key Elements</h4>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[#ef4444] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Heartbeat Waveform</strong>
                  <br />
                  Represents continuous network monitoring and real-time data flow
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full border-2 border-[#ef4444] shrink-0 mt-0.5" />
                <div>
                  <strong className="text-foreground">Network Nodes</strong>
                  <br />
                  Symbolize L1 validators and network connectivity
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-6 h-6 rounded border border-border flex items-center justify-center shrink-0 mt-0.5 text-xs">
                  L1
                </div>
                <div>
                  <strong className="text-foreground">Wordmark</strong>
                  <br />
                  Clean, modern typeface with medium weight (500)
                </div>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="mb-4">Design Specifications</h4>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="mb-2">Icon Dimensions</div>
                <code className="text-sm text-muted-foreground">48×48px viewBox</code>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="mb-2">Stroke Weight</div>
                <code className="text-sm text-muted-foreground">2.5px for main pulse line</code>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="mb-2">Node Sizes</div>
                <code className="text-sm text-muted-foreground">2.5px - 4.5px radius</code>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="mb-2">Typeface</div>
                <code className="text-sm text-muted-foreground">System UI / San Francisco</code>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="mb-2">Letter Spacing</div>
                <code className="text-sm text-muted-foreground">-0.01em (tight)</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Clear Space */}
      <section className="p-8 rounded-xl border border-border bg-card">
        <h3 className="mb-6">Clear Space & Minimum Size</h3>
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h4 className="mb-4">Clear Space</h4>
            <p className="text-muted-foreground mb-4">
              Maintain a minimum clear space equal to the height of the icon on all sides to ensure logo legibility.
            </p>
            <div className="relative p-12 rounded-lg border-2 border-dashed border-border bg-muted/30 flex items-center justify-center">
              <div className="absolute inset-0 m-8 border border-[#ef4444]/30 rounded" />
              <L1BeatLogo size="medium" theme={theme} />
            </div>
          </div>
          <div>
            <h4 className="mb-4">Minimum Sizes</h4>
            <p className="text-muted-foreground mb-4">
              To maintain legibility across different mediums:
            </p>
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <strong>Full Logo (Digital)</strong>
                  <code className="text-sm text-muted-foreground">120px width</code>
                </div>
                <div className="text-sm text-muted-foreground">Websites, apps, presentations</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <strong>Icon Only (Digital)</strong>
                  <code className="text-sm text-muted-foreground">24px × 24px</code>
                </div>
                <div className="text-sm text-muted-foreground">Favicons, app icons, social media</div>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <strong>Print</strong>
                  <code className="text-sm text-muted-foreground">0.5 inches</code>
                </div>
                <div className="text-sm text-muted-foreground">Business cards, letterheads</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
