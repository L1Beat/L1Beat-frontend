import { L1BeatLogo } from './L1BeatLogo';
import { Check, X, TrendingUp, Activity } from 'lucide-react';
import screenshot1 from 'figma:asset/6ea0f22eee33f67f0fa7a1a2d1a048925493242f.png';

export function BrandIntegrationGuide() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-6">
      <div className="max-w-7xl mx-auto space-y-16">
        {/* Header */}
        <div className="text-center">
          <L1BeatLogo size="large" theme="dark" />
          <h1 className="text-4xl mt-8 mb-4">Dashboard Brand Integration Guide</h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Here's how to align your current dashboard with the L1Beat brand guidelines
          </p>
        </div>

        {/* Current State */}
        <section>
          <h2 className="text-3xl mb-6">Current Dashboard</h2>
          <div className="rounded-xl border border-border overflow-hidden">
            <img src={screenshot1} alt="Current Dashboard" className="w-full" />
          </div>
          <div className="mt-6 grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5">
              <h3 className="mb-4 flex items-center gap-2">
                <X className="w-5 h-5 text-red-500" />
                Issues to Address
              </h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Text-only logo without the iconic heartbeat/pulse symbol</li>
                <li>• Blue accent color (#5B7FE8) instead of brand red (#ef4444)</li>
                <li>• Navy/dark blue background (#0F1729) instead of pure dark</li>
                <li>• Stats cards use blue theme throughout</li>
                <li>• Missing brand consistency with design system</li>
              </ul>
            </div>
            <div className="p-6 rounded-xl border border-green-500/20 bg-green-500/5">
              <h3 className="mb-4 flex items-center gap-2">
                <Check className="w-5 h-5 text-green-500" />
                What's Already Good
              </h3>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Clean, modern interface design</li>
                <li>• Great data visualization approach</li>
                <li>• Good use of green for positive metrics</li>
                <li>• Well-organized layout and hierarchy</li>
                <li>• Professional typography choices</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Color Replacement Guide */}
        <section>
          <h2 className="text-3xl mb-6">Color Replacements</h2>
          <div className="space-y-4">
            <div className="p-6 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg" style={{ backgroundColor: '#5B7FE8' }} />
                  <div>
                    <h4>Current Blue</h4>
                    <code className="text-sm text-muted-foreground">#5B7FE8</code>
                  </div>
                </div>
                <div className="text-3xl text-muted-foreground">→</div>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg" style={{ backgroundColor: '#ef4444' }} />
                  <div>
                    <h4>Brand Red</h4>
                    <code className="text-sm text-muted-foreground">#ef4444</code>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Replace primary accent color in: stat cards, buttons, highlights, active states
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg" style={{ backgroundColor: '#0F1729' }} />
                  <div>
                    <h4>Current Navy</h4>
                    <code className="text-sm text-muted-foreground">#0F1729</code>
                  </div>
                </div>
                <div className="text-3xl text-muted-foreground">→</div>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg border border-border" style={{ backgroundColor: '#0a0a0a' }} />
                  <div>
                    <h4>Brand Dark</h4>
                    <code className="text-sm text-muted-foreground">#0a0a0a</code>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Replace background color for true neutral dark that works with brand red
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg" style={{ backgroundColor: '#1E293B' }} />
                  <div>
                    <h4>Current Card BG</h4>
                    <code className="text-sm text-muted-foreground">#1E293B</code>
                  </div>
                </div>
                <div className="text-3xl text-muted-foreground">→</div>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-lg border border-border" style={{ backgroundColor: '#1a1a1a' }} />
                  <div>
                    <h4>Brand Card BG</h4>
                    <code className="text-sm text-muted-foreground">#1a1a1a</code>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Replace card/surface colors with neutral dark gray
              </p>
            </div>
          </div>
        </section>

        {/* Component Examples */}
        <section>
          <h2 className="text-3xl mb-6">Branded Components</h2>
          
          {/* Stat Cards Comparison */}
          <div className="space-y-6">
            <h3 className="mb-4">Stat Cards</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-sm text-muted-foreground mb-3">❌ Current (Blue Theme)</div>
                <div className="p-6 rounded-xl border border-border" style={{ backgroundColor: '#1E293B' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: '#5B7FE8' }}>
                        <TrendingUp className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Network TPS</div>
                        <div className="text-2xl">44</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div>
                <div className="text-sm text-muted-foreground mb-3">✅ Branded (Red Theme)</div>
                <div className="p-6 rounded-xl border border-border" style={{ backgroundColor: '#1a1a1a' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg" style={{ backgroundColor: '#ef4444' }}>
                        <TrendingUp className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-400">Network TPS</div>
                        <div className="text-2xl">44</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Buttons Comparison */}
          <div className="mt-8">
            <h3 className="mb-4">Buttons & Interactive Elements</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="text-sm text-muted-foreground mb-3">❌ Current</div>
                <div className="flex gap-3">
                  <button className="px-4 py-2 rounded-lg text-white text-sm" style={{ backgroundColor: '#5B7FE8' }}>
                    Primary Action
                  </button>
                  <button className="px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: '#1E293B', color: '#5B7FE8', border: '1px solid #5B7FE8' }}>
                    Secondary
                  </button>
                </div>
              </div>
              
              <div>
                <div className="text-sm text-muted-foreground mb-3">✅ Branded</div>
                <div className="flex gap-3">
                  <button className="px-4 py-2 rounded-lg bg-[#ef4444] text-white text-sm hover:bg-[#dc2626] transition-colors">
                    Primary Action
                  </button>
                  <button className="px-4 py-2 rounded-lg text-sm border border-border hover:bg-accent transition-colors">
                    Secondary
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="mt-8">
            <h3 className="mb-4">Charts & Data Visualization</h3>
            <div className="p-6 rounded-xl border border-border bg-card">
              <p className="text-sm text-muted-foreground mb-4">
                For charts and graphs, use brand red (#ef4444) for primary data series:
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Line charts: Use #ef4444 for the main line with gradient fill</li>
                <li>• Bar charts: Use #ef4444 for primary bars, green (#22c55e) for positive comparisons</li>
                <li>• Pie/Donut charts: Use #ef4444 as the primary segment color</li>
                <li>• Area charts: Use #ef4444 with 20% opacity fill</li>
                <li>• Keep green (#22c55e) for positive metrics and red (#dc2626) for negative/destructive actions</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Implementation Checklist */}
        <section className="p-8 rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/5">
          <h2 className="text-3xl mb-6">Implementation Checklist</h2>
          <div className="space-y-3">
            {[
              'Replace text logo with <L1BeatLogo size="small" theme="dark" />',
              'Update primary color from #5B7FE8 to #ef4444',
              'Change background from #0F1729 to #0a0a0a',
              'Update card backgrounds from #1E293B to #1a1a1a',
              'Replace blue stat card highlights with red',
              'Update button primary color to #ef4444',
              'Modify chart colors to use brand red',
              'Update hover states to use #dc2626 (darker red)',
              'Keep green colors for positive metrics (already good!)',
              'Test accessibility - ensure red has sufficient contrast',
            ].map((item, index) => (
              <label key={index} className="flex items-start gap-3 cursor-pointer group">
                <input type="checkbox" className="mt-1 accent-[#ef4444]" />
                <span className="group-hover:text-foreground transition-colors">{item}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Code Snippets */}
        <section>
          <h2 className="text-3xl mb-6">Quick Code Updates</h2>
          <div className="space-y-4">
            <div className="p-6 rounded-xl border border-border bg-card">
              <h4 className="mb-3">CSS Variable Updates</h4>
              <pre className="p-4 rounded-lg bg-muted overflow-x-auto text-sm">
                <code>{`/* Replace these in your CSS */
:root {
  --primary: #ef4444;      /* was #5B7FE8 */
  --primary-dark: #dc2626; /* for hover states */
  --background: #0a0a0a;   /* was #0F1729 */
  --card: #1a1a1a;         /* was #1E293B */
}`}</code>
              </pre>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card">
              <h4 className="mb-3">Tailwind Class Replacements</h4>
              <pre className="p-4 rounded-lg bg-muted overflow-x-auto text-sm">
                <code>{`// Find and replace in your components
bg-blue-500     → bg-[#ef4444]
text-blue-500   → text-[#ef4444]
border-blue-500 → border-[#ef4444]
hover:bg-blue-600 → hover:bg-[#dc2626]

// Background colors
bg-slate-900    → bg-[#0a0a0a]
bg-slate-800    → bg-[#1a1a1a]`}</code>
              </pre>
            </div>

            <div className="p-6 rounded-xl border border-border bg-card">
              <h4 className="mb-3">Chart Configuration (Recharts)</h4>
              <pre className="p-4 rounded-lg bg-muted overflow-x-auto text-sm">
                <code>{`<LineChart>
  <Line 
    type="monotone" 
    dataKey="messages" 
    stroke="#ef4444"      // Brand red
    strokeWidth={2}
    dot={{ fill: '#ef4444', r: 4 }}
  />
  <Area 
    type="monotone" 
    dataKey="volume" 
    stroke="#ef4444"
    fill="url(#gradient)"  // Use gradient with brand red
  />
</LineChart>

<defs>
  <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3}/>
    <stop offset="100%" stopColor="#ef4444" stopOpacity={0}/>
  </linearGradient>
</defs>`}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* Final Result Preview */}
        <section>
          <h2 className="text-3xl mb-6">Expected Result</h2>
          <div className="p-8 rounded-xl border border-[#ef4444]/20 bg-gradient-to-br from-background to-[#ef4444]/5">
            <div className="text-center mb-8">
              <L1BeatLogo size="large" theme="dark" />
              <p className="text-muted-foreground mt-4">
                Your dashboard will have a cohesive, branded appearance that matches your professional logo and color system
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { label: 'Network TPS', value: '44', icon: Activity },
                { label: 'Active Chains', value: '63', icon: TrendingUp },
                { label: 'Total Messages', value: '6.9K', icon: Activity },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="p-6 rounded-xl border border-border" style={{ backgroundColor: '#1a1a1a' }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-[#ef4444]">
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                  </div>
                  <div className="text-3xl" style={{ color: '#ef4444' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
