import { useState } from 'react';
import { L1BeatLogo } from './components/L1BeatLogo';
import { BrandColors } from './components/BrandColors';
import { LogoShowcase } from './components/LogoShowcase';
import { Typography } from './components/Typography';
import { UsageGuidelines } from './components/UsageGuidelines';
import { DownloadAssets } from './components/DownloadAssets';
import { ExampleApplications } from './components/ExampleApplications';
import { BrandIntegrationGuide } from './components/BrandIntegrationGuide';
import { Copy, Download, Palette, Type, Layout, Package, Code } from 'lucide-react';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeSection, setActiveSection] = useState('overview');

  const sections = [
    { id: 'overview', label: 'Overview', icon: Layout },
    { id: 'integration', label: 'Integration', icon: Code },
    { id: 'logo', label: 'Logo', icon: Copy },
    { id: 'colors', label: 'Colors', icon: Palette },
    { id: 'typography', label: 'Typography', icon: Type },
    { id: 'usage', label: 'Usage', icon: Copy },
    { id: 'assets', label: 'Assets', icon: Download },
    { id: 'examples', label: 'Examples', icon: Package },
  ];

  return (
    <div className={theme}>
      <div className="min-h-screen bg-background text-foreground transition-colors">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <L1BeatLogo size="small" theme={theme} />
            <div className="flex items-center gap-4">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
              >
                {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
              </button>
            </div>
          </div>
        </header>

        {/* Navigation */}
        <nav className="border-b border-border bg-muted/30">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex gap-1 overflow-x-auto">
              {sections.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap
                    ${activeSection === id 
                      ? 'border-[#ef4444] text-foreground' 
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-12">
          {activeSection === 'integration' && <BrandIntegrationGuide />}
          {activeSection === 'overview' && (
            <div className="space-y-12">
              {/* Hero Section */}
              <section className="text-center py-12">
                <div className="inline-block mb-8">
                  <L1BeatLogo size="large" theme={theme} />
                </div>
                <h1 className="text-4xl mb-4">L1Beat Brand Guidelines</h1>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  A comprehensive data analytics tool for Avalanche L1s. Our brand combines the pulse of network activity with the precision of data analytics.
                </p>
              </section>

              {/* Key Principles */}
              <section className="grid md:grid-cols-3 gap-6">
                <div className="p-6 rounded-xl border border-border bg-card">
                  <div className="w-12 h-12 rounded-lg bg-[#ef4444]/10 flex items-center justify-center mb-4">
                    <div className="w-6 h-6 rounded-full bg-[#ef4444]" />
                  </div>
                  <h3 className="mb-2">Heartbeat & Pulse</h3>
                  <p className="text-muted-foreground">
                    Our logo represents the living, breathing network - constantly monitoring and analyzing L1 activity.
                  </p>
                </div>
                <div className="p-6 rounded-xl border border-border bg-card">
                  <div className="w-12 h-12 rounded-lg bg-[#ef4444]/10 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                      <circle cx="5" cy="12" r="2" fill="#ef4444" />
                      <circle cx="12" cy="12" r="2" fill="#ef4444" />
                      <circle cx="19" cy="12" r="2" fill="#ef4444" />
                      <path d="M5 12h14" stroke="#ef4444" strokeWidth="1" opacity="0.3" />
                    </svg>
                  </div>
                  <h3 className="mb-2">Network Analytics</h3>
                  <p className="text-muted-foreground">
                    Data points and connections represent the distributed nature of Avalanche L1s.
                  </p>
                </div>
                <div className="p-6 rounded-xl border border-border bg-card">
                  <div className="w-12 h-12 rounded-lg bg-[#ef4444]/10 flex items-center justify-center mb-4">
                    <div className="text-2xl">🎨</div>
                  </div>
                  <h3 className="mb-2">Clean & Modern</h3>
                  <p className="text-muted-foreground">
                    Minimalist design inspired by Nansen.ai, optimized for both light and dark themes.
                  </p>
                </div>
              </section>

              {/* Quick Stats */}
              <section className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-6 rounded-xl border border-border bg-card text-center">
                  <div className="text-3xl mb-2" style={{ color: '#ef4444' }}>10</div>
                  <div className="text-muted-foreground">Logo Variants</div>
                </div>
                <div className="p-6 rounded-xl border border-border bg-card text-center">
                  <div className="text-3xl mb-2" style={{ color: '#ef4444' }}>6</div>
                  <div className="text-muted-foreground">Brand Colors</div>
                </div>
                <div className="p-6 rounded-xl border border-border bg-card text-center">
                  <div className="text-3xl mb-2" style={{ color: '#ef4444' }}>2</div>
                  <div className="text-muted-foreground">Theme Modes</div>
                </div>
                <div className="p-6 rounded-xl border border-border bg-card text-center">
                  <div className="text-3xl mb-2" style={{ color: '#ef4444' }}>∞</div>
                  <div className="text-muted-foreground">Possibilities</div>
                </div>
              </section>
            </div>
          )}

          {activeSection === 'logo' && <LogoShowcase theme={theme} />}
          {activeSection === 'colors' && <BrandColors theme={theme} />}
          {activeSection === 'typography' && <Typography theme={theme} />}
          {activeSection === 'usage' && <UsageGuidelines theme={theme} />}
          {activeSection === 'assets' && <DownloadAssets theme={theme} />}
          {activeSection === 'examples' && <ExampleApplications theme={theme} />}
        </main>

        {/* Footer */}
        <footer className="border-t border-border mt-24">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <L1BeatLogo size="small" theme={theme} />
                <p className="text-muted-foreground mt-2">
                  Data analytics for Avalanche L1s
                </p>
              </div>
              <div className="text-muted-foreground text-center md:text-right">
                <p>© 2025 L1Beat. All rights reserved.</p>
                <p className="mt-1">Brand guidelines version 1.0</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
