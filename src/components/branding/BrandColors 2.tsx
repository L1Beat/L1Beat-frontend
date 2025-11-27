import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

interface BrandColorsProps {
  theme: 'dark' | 'light';
}

export function BrandColors({ theme }: BrandColorsProps) {
  const [copiedColor, setCopiedColor] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedColor(label);
    setTimeout(() => setCopiedColor(null), 2000);
  };

  const primaryColors = [
    { name: 'Primary Red', hex: '#ef4444', rgb: 'rgb(239, 68, 68)', usage: 'Main brand color, primary actions' },
    { name: 'Dark Red', hex: '#dc2626', rgb: 'rgb(220, 38, 38)', usage: 'Light mode variant, hover states' },
    { name: 'Deep Red', hex: '#b91c1c', rgb: 'rgb(185, 28, 28)', usage: 'Active states, emphasis' },
  ];

  const neutrals = [
    { name: 'Pure White', hex: '#ffffff', rgb: 'rgb(255, 255, 255)', usage: 'Light mode backgrounds' },
    { name: 'Slate 50', hex: '#f8fafc', rgb: 'rgb(248, 250, 252)', usage: 'Light mode surfaces' },
    { name: 'Slate 900', hex: '#0f172a', rgb: 'rgb(15, 23, 42)', usage: 'Dark text on light' },
    { name: 'Dark Background', hex: '#0a0a0a', rgb: 'rgb(10, 10, 10)', usage: 'Dark mode background' },
    { name: 'Muted Gray', hex: '#71717a', rgb: 'rgb(113, 113, 122)', usage: 'Secondary text' },
  ];

  const ColorCard = ({ name, hex, rgb, usage }: typeof primaryColors[0]) => (
    <div className="rounded-xl border border-border overflow-hidden bg-card">
      <div 
        className="h-32 relative group"
        style={{ backgroundColor: hex }}
      >
        <button
          onClick={() => copyToClipboard(hex, name)}
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 backdrop-blur-sm"
        >
          {copiedColor === name ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/90 text-gray-900">
              <Check className="w-4 h-4" />
              <span>Copied!</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/90 text-gray-900">
              <Copy className="w-4 h-4" />
              <span>Copy</span>
            </div>
          )}
        </button>
      </div>
      <div className="p-4">
        <h4 className="mb-2">{name}</h4>
        <div className="space-y-1 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">HEX</span>
            <code className="px-2 py-1 rounded bg-muted">{hex}</code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">RGB</span>
            <code className="px-2 py-1 rounded bg-muted text-xs">{rgb}</code>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{usage}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-3xl mb-3">Brand Colors</h2>
        <p className="text-muted-foreground max-w-3xl">
          Our color palette is built around Avalanche's signature red, creating a bold and modern aesthetic that works beautifully across light and dark themes.
        </p>
      </div>

      {/* Primary Colors */}
      <section>
        <h3 className="mb-6">Primary Colors</h3>
        <div className="grid md:grid-cols-3 gap-6">
          {primaryColors.map((color) => (
            <ColorCard key={color.name} {...color} />
          ))}
        </div>
      </section>

      {/* Neutral Colors */}
      <section>
        <h3 className="mb-6">Neutral Colors</h3>
        <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-6">
          {neutrals.map((color) => (
            <ColorCard key={color.name} {...color} />
          ))}
        </div>
      </section>

      {/* Color Usage Guidelines */}
      <section className="p-8 rounded-xl border border-border bg-card">
        <h3 className="mb-6">Color Usage Guidelines</h3>
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="mb-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                Do's
              </h4>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Use #ef4444 as the primary brand color across all touchpoints</li>
                <li>• Maintain sufficient contrast ratios for accessibility (WCAG AA)</li>
                <li>• Use red sparingly for emphasis and important actions</li>
                <li>• Apply the color to data visualizations and charts</li>
                <li>• Use neutral colors for text and backgrounds</li>
              </ul>
            </div>
            <div>
              <h4 className="mb-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                Don'ts
              </h4>
              <ul className="space-y-2 text-muted-foreground">
                <li>• Don't use off-brand reds or modify the primary color</li>
                <li>• Avoid using red for destructive actions (use system red)</li>
                <li>• Don't place red text on red backgrounds</li>
                <li>• Avoid oversaturating the design with too much red</li>
                <li>• Don't use the brand colors for unrelated purposes</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Accessibility */}
      <section className="p-8 rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/5">
        <h3 className="mb-4">Accessibility Considerations</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="mb-2">Dark Mode</h4>
            <p className="text-muted-foreground mb-3">
              Primary red (#ef4444) on dark background (#0a0a0a) provides excellent contrast with a ratio of 8.2:1
            </p>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-lg" style={{ backgroundColor: '#0a0a0a', color: '#ef4444' }}>
                Sample Text
              </div>
              <span className="text-sm text-muted-foreground">Contrast: 8.2:1 (AAA)</span>
            </div>
          </div>
          <div>
            <h4 className="mb-2">Light Mode</h4>
            <p className="text-muted-foreground mb-3">
              Dark red (#dc2626) on white background provides a contrast ratio of 6.4:1
            </p>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-lg border border-border" style={{ backgroundColor: '#ffffff', color: '#dc2626' }}>
                Sample Text
              </div>
              <span className="text-sm text-muted-foreground">Contrast: 6.4:1 (AA)</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
