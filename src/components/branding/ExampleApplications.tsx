import { L1BeatLogo } from '../L1BeatLogo';
import { TrendingUp, Activity, BarChart3, Network } from 'lucide-react';

interface ExampleApplicationsProps {
  theme: 'dark' | 'light';
}

export function ExampleApplications({ theme }: ExampleApplicationsProps) {
  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-3xl mb-3">Example Applications</h2>
        <p className="text-muted-foreground max-w-3xl">
          See how the L1Beat brand comes together in real-world applications, from web dashboards to marketing materials.
        </p>
      </div>

      {/* Dashboard Header */}
      <section>
        <h3 className="mb-6">Dashboard Header</h3>
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="p-4 bg-card border-b border-border flex items-center justify-between">
            <L1BeatLogo size="small" theme={theme} />
            <div className="flex items-center gap-4">
              <button className="px-4 py-2 rounded-lg text-sm hover:bg-accent transition-colors">
                Dashboard
              </button>
              <button className="px-4 py-2 rounded-lg text-sm hover:bg-accent transition-colors">
                Analytics
              </button>
              <button className="px-4 py-2 rounded-lg text-sm hover:bg-accent transition-colors">
                Networks
              </button>
              <button className="px-4 py-2 rounded-lg bg-[#ef4444] text-white text-sm hover:bg-[#dc2626] transition-colors">
                Connect Wallet
              </button>
            </div>
          </div>
          <div className="p-8 bg-muted/30">
            <div className="mb-6">
              <h1 className="mb-2">Avalanche L1 Analytics</h1>
              <p className="text-muted-foreground">
                Real-time monitoring and insights for all Avalanche L1 blockchains
              </p>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              {[
                { label: 'Total Value Locked', value: '$2.4B', icon: TrendingUp },
                { label: 'Active L1s', value: '156', icon: Network },
                { label: 'Transactions/day', value: '4.2M', icon: Activity },
                { label: 'Avg Block Time', value: '2.1s', icon: BarChart3 },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="p-6 rounded-xl bg-card border border-border">
                  <div className="flex items-start justify-between mb-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <Icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl" style={{ color: '#ef4444' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Marketing Website Hero */}
      <section>
        <h3 className="mb-6">Marketing Website Hero</h3>
        <div className="rounded-xl border border-border overflow-hidden bg-gradient-to-br from-background to-muted/50">
          <div className="p-6 border-b border-border">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <L1BeatLogo size="small" theme={theme} />
              <div className="flex items-center gap-6">
                <a href="#" className="text-sm hover:text-[#ef4444] transition-colors">Features</a>
                <a href="#" className="text-sm hover:text-[#ef4444] transition-colors">Pricing</a>
                <a href="#" className="text-sm hover:text-[#ef4444] transition-colors">Docs</a>
                <button className="px-4 py-2 rounded-lg bg-[#ef4444] text-white text-sm hover:bg-[#dc2626] transition-colors">
                  Get Started
                </button>
              </div>
            </div>
          </div>
          <div className="py-20 px-6">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-block mb-8">
                <L1BeatLogo size="large" theme={theme} />
              </div>
              <h1 className="text-5xl mb-6">
                The pulse of Avalanche L1s
              </h1>
              <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Comprehensive analytics and monitoring for every Avalanche L1. Track performance, analyze trends, and make data-driven decisions.
              </p>
              <div className="flex items-center justify-center gap-4">
                <button className="px-6 py-3 rounded-lg bg-[#ef4444] text-white hover:bg-[#dc2626] transition-colors">
                  Start Exploring
                </button>
                <button className="px-6 py-3 rounded-lg border border-border hover:bg-accent transition-colors">
                  View Demo
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile App */}
      <section>
        <h3 className="mb-6">Mobile Application</h3>
        <div className="flex items-center justify-center">
          <div className="w-[340px] h-[680px] rounded-[3rem] border-8 border-foreground/20 bg-card overflow-hidden shadow-2xl">
            <div className="h-full flex flex-col">
              {/* Status Bar */}
              <div className="h-12 flex items-center justify-center">
                <div className="text-xs">9:41</div>
              </div>
              
              {/* App Header */}
              <div className="px-6 py-4 border-b border-border">
                <div className="flex items-center justify-center mb-4">
                  <L1BeatLogo size="small" theme={theme} />
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 overflow-hidden p-6 space-y-4">
                <div className="p-4 rounded-2xl bg-muted/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-muted-foreground">Network Health</span>
                    <Activity className="w-4 h-4" style={{ color: '#ef4444' }} />
                  </div>
                  <div className="text-2xl mb-1" style={{ color: '#ef4444' }}>98.5%</div>
                  <div className="text-xs text-muted-foreground">All systems operational</div>
                </div>
                
                <div className="p-4 rounded-2xl bg-muted/50">
                  <div className="text-xs text-muted-foreground mb-2">Active Validators</div>
                  <div className="text-2xl" style={{ color: '#ef4444' }}>1,247</div>
                </div>
                
                <div className="p-4 rounded-2xl bg-muted/50">
                  <div className="text-xs text-muted-foreground mb-2">Avg Response Time</div>
                  <div className="text-2xl" style={{ color: '#ef4444' }}>124ms</div>
                </div>
                
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Recent Activity</div>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-3 rounded-xl bg-muted/50 flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
                      <div className="flex-1">
                        <div className="text-xs">Block #{12345 + i}</div>
                        <div className="text-xs text-muted-foreground">2 seconds ago</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Media */}
      <section>
        <h3 className="mb-6">Social Media</h3>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Twitter/X Card */}
          <div>
            <div className="mb-3 text-sm text-muted-foreground">Twitter/X Post</div>
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              <div className="p-4 border-b border-border flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-[#ef4444]/10 flex items-center justify-center shrink-0">
                  <L1BeatLogo size="small" iconOnly theme={theme} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span>L1Beat</span>
                    <span className="text-xs text-muted-foreground">@l1beat · 2h</span>
                  </div>
                  <p className="text-sm mb-3">
                    📊 New features just dropped! Track cross-L1 liquidity flows, compare validator performance, and get real-time alerts. 
                  </p>
                  <div className="text-sm" style={{ color: '#ef4444' }}>#Avalanche #L1 #Analytics</div>
                </div>
              </div>
              <div className="aspect-video bg-gradient-to-br from-background to-muted/50 flex items-center justify-center">
                <L1BeatLogo size="large" theme={theme} />
              </div>
            </div>
          </div>

          {/* LinkedIn Card */}
          <div>
            <div className="mb-3 text-sm text-muted-foreground">LinkedIn Post</div>
            <div className="rounded-xl border border-border overflow-hidden bg-card">
              <div className="p-4 border-b border-border flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-[#ef4444]/10 flex items-center justify-center shrink-0">
                  <L1BeatLogo size="small" iconOnly theme={theme} />
                </div>
                <div className="flex-1">
                  <div className="mb-1">L1Beat</div>
                  <span className="text-xs text-muted-foreground">Data Analytics · 1,247 followers</span>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm mb-3">
                  Excited to share our Q4 2024 Avalanche L1 Report! 📈
                  <br /><br />
                  Key findings: 156 active L1s, $2.4B TVL, 98.5% uptime.
                  <br /><br />
                  Read the full report → l1beat.io/reports
                </p>
              </div>
              <div className="aspect-[2/1] bg-gradient-to-br from-background to-muted/50 flex flex-col items-center justify-center p-8">
                <L1BeatLogo size="large" theme={theme} />
                <div className="mt-4 text-center">
                  <div className="text-xl mb-1">Q4 2024 Report</div>
                  <div className="text-sm text-muted-foreground">Avalanche L1 Analytics</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Email Signature */}
      <section>
        <h3 className="mb-6">Email Signature</h3>
        <div className="p-6 rounded-xl border border-border bg-card">
          <div className="max-w-md">
            <div className="mb-4">
              <div>John Doe</div>
              <div className="text-sm text-muted-foreground">Senior Blockchain Analyst</div>
            </div>
            <div className="py-4 border-t border-border flex items-center gap-4">
              <L1BeatLogo size="small" theme={theme} />
              <div className="text-sm">
                <div>john.doe@l1beat.io</div>
                <div className="text-muted-foreground">www.l1beat.io</div>
              </div>
            </div>
            <div className="pt-4 border-t border-border text-xs text-muted-foreground">
              📊 Tracking the pulse of Avalanche L1s
            </div>
          </div>
        </div>
      </section>

      {/* Business Card */}
      <section>
        <h3 className="mb-6">Business Card</h3>
        <div className="flex items-center justify-center">
          <div className="w-[500px] h-[300px] rounded-2xl border border-border bg-gradient-to-br from-card to-muted/50 p-8 flex flex-col justify-between shadow-xl">
            <div>
              <L1BeatLogo size="medium" theme={theme} />
            </div>
            <div>
              <div className="mb-4">
                <div className="text-xl mb-1">Jane Smith</div>
                <div className="text-muted-foreground">Product Manager</div>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>jane.smith@l1beat.io</div>
                <div>+1 (555) 123-4567</div>
                <div>www.l1beat.io</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Presentation Slide */}
      <section>
        <h3 className="mb-6">Presentation Slide</h3>
        <div className="aspect-video rounded-xl border border-border overflow-hidden bg-gradient-to-br from-background to-muted/50">
          <div className="h-full flex flex-col p-12">
            <div className="mb-8">
              <L1BeatLogo size="small" theme={theme} />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-3xl">
                <h1 className="text-5xl mb-6">
                  The Future of L1 Analytics
                </h1>
                <p className="text-xl text-muted-foreground">
                  Comprehensive insights and real-time monitoring for the Avalanche ecosystem
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Q4 2024 Product Roadmap</span>
              <span>l1beat.io</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}