import { useEffect, useState } from 'react';
import { Copy, Download, Layout as LayoutIcon, Package, Palette, Type } from 'lucide-react';
import { L1BeatLogo } from '../components/L1BeatLogo';
import { BrandColors } from '../components/branding/BrandColors';
import { LogoShowcase } from '../components/branding/LogoShowcase';
import { Typography } from '../components/branding/Typography';
import { UsageGuidelines } from '../components/branding/UsageGuidelines';
import { DownloadAssets } from '../components/branding/DownloadAssets';
import { ExampleApplications } from '../components/branding/ExampleApplications';
import { useTheme } from '../hooks/useTheme';
import { SEO } from '../components/SEO';

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: LayoutIcon },
  { id: 'logo', label: 'Logo', icon: Copy },
  { id: 'colors', label: 'Colors', icon: Palette },
  { id: 'typography', label: 'Typography', icon: Type },
  { id: 'usage', label: 'Usage', icon: Copy },
  { id: 'assets', label: 'Assets', icon: Download },
  { id: 'examples', label: 'Examples', icon: Package },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

// Sticky topbar (56) + this nav (~44) + breathing room.
const NAV_SCROLL_OFFSET = 56 + 44 + 16;

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  window.scrollTo({ top: window.scrollY + rect.top - NAV_SCROLL_OFFSET, behavior: 'smooth' });
}

export function BrandGuidelines() {
  const { theme } = useTheme();
  const [activeSection, setActiveSection] = useState<SectionId>('overview');

  // Scroll spy: highlight the section currently under the sticky nav.
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const threshold = NAV_SCROLL_OFFSET + 8;
        let next: SectionId = SECTIONS[0].id;
        for (const s of SECTIONS) {
          const el = document.getElementById(s.id);
          if (!el) continue;
          if (el.getBoundingClientRect().top <= threshold) next = s.id;
        }
        setActiveSection((prev) => (prev === next ? prev : next));
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <SEO
        title="Brand Guidelines"
        description="L1Beat brand kit: logo, colors, typography, usage rules, and downloadable assets."
        url="/brand"
      />
      <header>
        <div className="text-[11px] font-bold tracking-[0.15em] text-[#ef4444] mb-1.5">
          BRAND GUIDELINES
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          How L1Beat looks, sounds, and feels.
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Logo, colors, typography, and usage guidance for product, web, and partner surfaces.
        </p>
      </header>

      {/* Sticky section nav — clicking scrolls to the section (single-page) */}
      <nav className="sticky top-14 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 bg-background/95 supports-[backdrop-filter]:bg-background/70 supports-[backdrop-filter]:backdrop-blur-md border-b border-border overflow-x-auto no-scrollbar">
        <div className="flex gap-1 min-w-max">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className={`flex items-center gap-2 h-11 px-3 border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-[#ef4444] text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#ef4444]' : ''}`} />
                <span className={`text-xs ${active ? 'font-semibold' : 'font-medium'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <section id="overview" className="scroll-mt-28 space-y-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#ef4444]/15 blur-3xl" />
          </div>
          <div className="relative p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8">
            <div className="shrink-0">
              <L1BeatLogo size="large" theme={theme} />
            </div>
            <div>
              <div className="text-[11px] font-bold tracking-[0.15em] text-[#ef4444] mb-1.5">
                THE PULSE OF AVALANCHE L1S
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight mb-2">
                L1Beat
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl">
                A comprehensive analytics tool for Avalanche L1s. Our brand combines the pulse
                of network activity with the precision of data analytics.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          <PrincipleCard
            title="Heartbeat & Pulse"
            description="The logo represents the living network, constantly monitoring and analyzing L1 activity."
            icon={<div className="w-3.5 h-3.5 rounded-full bg-[#ef4444]" />}
          />
          <PrincipleCard
            title="Networked"
            description="Nodes and connections represent the distributed nature of Avalanche L1s."
            icon={
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="5" cy="12" r="2" fill="#ef4444" />
                <circle cx="12" cy="12" r="2" fill="#ef4444" />
                <circle cx="19" cy="12" r="2" fill="#ef4444" />
                <path d="M5 12h14" stroke="#ef4444" strokeWidth="1" opacity="0.3" />
              </svg>
            }
          />
          <PrincipleCard
            title="Clean & Modern"
            description="Minimalist, data-driven design optimized for both light and dark themes."
            icon={<span className="text-base">✦</span>}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard value="10" label="Logo variants" />
          <StatCard value="6" label="Brand colors" />
          <StatCard value="2" label="Theme modes" />
          <StatCard value="∞" label="Possibilities" />
        </div>
      </section>

      <section id="logo" className="scroll-mt-28">
        <LogoShowcase theme={theme} />
      </section>
      <section id="colors" className="scroll-mt-28">
        <BrandColors theme={theme} />
      </section>
      <section id="typography" className="scroll-mt-28">
        <Typography theme={theme} />
      </section>
      <section id="usage" className="scroll-mt-28">
        <UsageGuidelines theme={theme} />
      </section>
      <section id="assets" className="scroll-mt-28">
        <DownloadAssets theme={theme} />
      </section>
      <section id="examples" className="scroll-mt-28">
        <ExampleApplications theme={theme} />
      </section>
    </div>
  );
}

function PrincipleCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="w-10 h-10 rounded-lg bg-[#ef4444]/10 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="text-2xl sm:text-3xl font-bold text-[#ef4444] tracking-tight">{value}</div>
      <div className="text-[11px] font-medium tracking-wide text-muted-foreground mt-1">
        {label}
      </div>
    </div>
  );
}
