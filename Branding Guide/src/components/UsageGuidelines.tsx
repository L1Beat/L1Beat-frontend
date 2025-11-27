import { L1BeatLogo } from './L1BeatLogo';
import { Check, X } from 'lucide-react';

interface UsageGuidelinesProps {
  theme: 'dark' | 'light';
}

export function UsageGuidelines({ theme }: UsageGuidelinesProps) {
  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-3xl mb-3">Usage Guidelines</h2>
        <p className="text-muted-foreground max-w-3xl">
          Follow these guidelines to maintain brand consistency and ensure the logo always looks its best across all applications.
        </p>
      </div>

      {/* Do's and Don'ts */}
      <section>
        <h3 className="mb-6">Do's and Don'ts</h3>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Do's */}
          <div className="space-y-4">
            <h4 className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="w-4 h-4 text-green-500" />
              </div>
              Do's
            </h4>
            
            <div className="p-6 rounded-xl border border-green-500/20 bg-green-500/5">
              <div className="mb-3 text-sm text-muted-foreground">Use the logo on appropriate backgrounds</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-6 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
                  <L1BeatLogo size="small" theme="dark" />
                </div>
                <div className="p-6 rounded-lg border border-border flex items-center justify-center" style={{ backgroundColor: '#ffffff' }}>
                  <L1BeatLogo size="small" theme="light" />
                </div>
              </div>
            </div>
            
            <div className="p-6 rounded-xl border border-green-500/20 bg-green-500/5">
              <div className="mb-3 text-sm text-muted-foreground">Maintain proper clear space</div>
              <div className="relative p-8 flex items-center justify-center bg-muted/30 rounded-lg">
                <div className="absolute inset-0 m-6 border border-green-500/30 rounded" />
                <L1BeatLogo size="small" theme={theme} />
              </div>
            </div>
            
            <div className="p-6 rounded-xl border border-green-500/20 bg-green-500/5">
              <div className="mb-3 text-sm text-muted-foreground">Use the animated version for digital</div>
              <div className="p-6 rounded-lg bg-muted/30 flex items-center justify-center">
                <L1BeatLogo size="medium" theme={theme} />
              </div>
            </div>
            
            <div className="p-6 rounded-xl border border-green-500/20 bg-green-500/5">
              <div className="mb-3 text-sm text-muted-foreground">Scale proportionally</div>
              <div className="flex items-end justify-center gap-4 p-6 rounded-lg bg-muted/30">
                <L1BeatLogo size="small" theme={theme} />
                <L1BeatLogo size="medium" theme={theme} />
              </div>
            </div>
          </div>

          {/* Don'ts */}
          <div className="space-y-4">
            <h4 className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                <X className="w-4 h-4 text-red-500" />
              </div>
              Don'ts
            </h4>
            
            <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5">
              <div className="mb-3 text-sm text-muted-foreground">Don't use on busy backgrounds</div>
              <div 
                className="p-6 rounded-lg flex items-center justify-center relative overflow-hidden"
                style={{
                  backgroundImage: 'linear-gradient(45deg, #ef4444 25%, #dc2626 25%, #dc2626 50%, #ef4444 50%, #ef4444 75%, #dc2626 75%, #dc2626)',
                  backgroundSize: '20px 20px'
                }}
              >
                <div className="relative z-10">
                  <L1BeatLogo size="small" theme="dark" />
                </div>
              </div>
            </div>
            
            <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5">
              <div className="mb-3 text-sm text-muted-foreground">Don't distort or stretch</div>
              <div className="p-6 rounded-lg bg-muted/30 flex items-center justify-center">
                <div style={{ transform: 'scaleX(1.5)' }}>
                  <L1BeatLogo size="small" theme={theme} />
                </div>
              </div>
            </div>
            
            <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5">
              <div className="mb-3 text-sm text-muted-foreground">Don't change the colors</div>
              <div className="p-6 rounded-lg bg-muted/30 flex items-center justify-center">
                <div className="flex items-center gap-3">
                  <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
                    <path d="M 4 24 L 10 24 L 14 16 L 18 32 L 22 20 L 26 28 L 30 24 L 34 24 L 38 16 L 42 32 L 44 24" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <circle cx="14" cy="16" r="3" fill="#22c55e" />
                    <circle cx="26" cy="28" r="3.5" fill="#22c55e" />
                    <circle cx="38" cy="16" r="3" fill="#22c55e" />
                  </svg>
                  <span style={{ fontSize: '24px', fontWeight: 500, color: '#22c55e' }}>L1Beat</span>
                </div>
              </div>
            </div>
            
            <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5">
              <div className="mb-3 text-sm text-muted-foreground">Don't add effects or outlines</div>
              <div className="p-6 rounded-lg bg-muted/30 flex items-center justify-center">
                <div style={{ filter: 'drop-shadow(0 0 10px #ef4444)', border: '2px solid #ef4444', borderRadius: '8px', padding: '8px' }}>
                  <L1BeatLogo size="small" theme={theme} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Background Recommendations */}
      <section>
        <h3 className="mb-6">Background Recommendations</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4>Recommended Backgrounds</h4>
            <div className="space-y-3">
              <div className="p-6 rounded-xl" style={{ backgroundColor: '#0a0a0a' }}>
                <div className="flex items-center justify-between mb-3">
                  <L1BeatLogo size="small" theme="dark" />
                  <Check className="w-5 h-5 text-green-500" />
                </div>
                <code className="text-sm" style={{ color: '#71717a' }}>#0a0a0a - Dark background</code>
              </div>
              
              <div className="p-6 rounded-xl border border-border" style={{ backgroundColor: '#ffffff' }}>
                <div className="flex items-center justify-between mb-3">
                  <L1BeatLogo size="small" theme="light" />
                  <Check className="w-5 h-5 text-green-500" />
                </div>
                <code className="text-sm text-muted-foreground">#ffffff - White background</code>
              </div>
              
              <div className="p-6 rounded-xl" style={{ backgroundColor: '#1a1a1a' }}>
                <div className="flex items-center justify-between mb-3">
                  <L1BeatLogo size="small" theme="dark" />
                  <Check className="w-5 h-5 text-green-500" />
                </div>
                <code className="text-sm" style={{ color: '#71717a' }}>#1a1a1a - Dark gray</code>
              </div>
              
              <div className="p-6 rounded-xl border border-border" style={{ backgroundColor: '#f8fafc' }}>
                <div className="flex items-center justify-between mb-3">
                  <L1BeatLogo size="small" theme="light" />
                  <Check className="w-5 h-5 text-green-500" />
                </div>
                <code className="text-sm text-muted-foreground">#f8fafc - Light gray</code>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <h4>Avoid These Backgrounds</h4>
            <div className="space-y-3">
              <div className="p-6 rounded-xl" style={{ backgroundColor: '#ef4444' }}>
                <div className="flex items-center justify-between mb-3">
                  <L1BeatLogo size="small" theme="dark" />
                  <X className="w-5 h-5 text-white" />
                </div>
                <code className="text-sm text-white">#ef4444 - Brand red (low contrast)</code>
              </div>
              
              <div className="p-6 rounded-xl" style={{ backgroundColor: '#888888' }}>
                <div className="flex items-center justify-between mb-3">
                  <L1BeatLogo size="small" theme="dark" />
                  <X className="w-5 h-5 text-white" />
                </div>
                <code className="text-sm text-white">#888888 - Mid gray (poor contrast)</code>
              </div>
              
              <div 
                className="p-6 rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <L1BeatLogo size="small" theme="dark" />
                  <X className="w-5 h-5 text-white" />
                </div>
                <code className="text-sm text-white">Gradients (competes with logo)</code>
              </div>
              
              <div 
                className="p-6 rounded-xl relative"
                style={{ backgroundColor: '#000' }}
              >
                <div 
                  className="absolute inset-0 opacity-30"
                  style={{
                    backgroundImage: 'url(data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=)',
                    backgroundSize: '20px 20px'
                  }}
                />
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <L1BeatLogo size="small" theme="dark" />
                  <X className="w-5 h-5 text-white" />
                </div>
                <code className="text-sm text-white relative z-10">Busy patterns (reduces clarity)</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Placement Guidelines */}
      <section className="p-8 rounded-xl border border-border bg-card">
        <h3 className="mb-6">Placement Guidelines</h3>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <h4 className="mb-3">Website Header</h4>
            <div className="aspect-video rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <L1BeatLogo size="small" theme={theme} />
                <div className="flex gap-2">
                  <div className="w-16 h-6 rounded bg-muted" />
                  <div className="w-16 h-6 rounded bg-muted" />
                </div>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Top left, standard size, with navigation items to the right
            </p>
          </div>
          
          <div>
            <h4 className="mb-3">Mobile App</h4>
            <div className="aspect-[9/16] max-w-[180px] rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-center mb-4">
                <L1BeatLogo size="small" theme={theme} />
              </div>
              <div className="space-y-2">
                <div className="h-3 rounded bg-muted" />
                <div className="h-3 rounded bg-muted w-3/4" />
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Centered in header with icon-only option for small screens
            </p>
          </div>
          
          <div>
            <h4 className="mb-3">Social Media</h4>
            <div className="aspect-square rounded-lg border border-border bg-muted/30 p-8 flex items-center justify-center">
              <L1BeatLogo size="medium" iconOnly theme={theme} />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Icon-only for profile pictures, full logo for cover images
            </p>
          </div>
        </div>
      </section>

      {/* Legal Usage */}
      <section className="p-8 rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/5">
        <h3 className="mb-4">Legal & Trademark Usage</h3>
        <div className="space-y-3 text-muted-foreground">
          <p>
            The L1Beat name and logo are trademarks. When using the logo:
          </p>
          <ul className="space-y-2 ml-6">
            <li>• Use the logo as provided without modifications</li>
            <li>• Don't imply endorsement or partnership without permission</li>
            <li>• Include appropriate trademark notices when required</li>
            <li>• Refer to "L1Beat" not "L1beat" or "l1beat" in text</li>
            <li>• Don't register or use confusingly similar marks</li>
          </ul>
          <p className="mt-4">
            For licensing inquiries or partnership opportunities, please contact the L1Beat team.
          </p>
        </div>
      </section>
    </div>
  );
}
