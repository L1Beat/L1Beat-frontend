import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { L1BeatLogo } from '../components/L1BeatLogo';
import { Delta, Sparkline, StatStrip } from '../components/instrument';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';

// Every value below is the one the site uses (index.css tokens, the logo component,
// the chart palette), so the page can't drift from the product again.
const SURFACES = [
  { name: 'Background', light: '#f5f6f7', dark: '#141619', use: 'The page behind everything' },
  { name: 'Stage', light: '#fafbfc', dark: '#0e1013', use: 'Behind hero charts' },
  { name: 'Card', light: '#ffffff', dark: '#1a1d21', use: 'Panels and tables' },
  { name: 'Border', light: '#dde1e6', dark: '#2a2f35', use: 'Hairlines between rows and panels' },
  { name: 'Text', light: '#17191c', dark: '#e8eaed', use: 'Headlines, numbers, labels that matter' },
  { name: 'Muted text', light: '#626a73', dark: '#9aa3ad', use: 'Captions, axis labels, secondary detail' },
];
const SIGNALS = [
  { name: 'Up', light: '#15803d', dark: '#3dbe7a', use: 'Rises, active, healthy' },
  { name: 'Down', light: '#c93234', dark: '#f05f5f', use: 'Drops, errors, below a limit' },
  { name: 'Logo red', light: '#dc2626', dark: '#e84142', use: 'The pulse in the logo, and nothing else' },
];
const CHART = [
  { name: 'Blue', hex: '#3987e5' },
  { name: 'Orange', hex: '#d95926' },
  { name: 'Green', hex: '#199e70' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Gold', hex: '#d4a017' },
  { name: 'Gray', hex: '#6b7280' },
];
const TYPE_SCALE = [
  { role: 'Headline', spec: 'Plex Sans 500, 34 / 26 px', sample: 'Avalanche L1s processed 43.1M transactions.', cls: 'text-[26px] sm:text-[34px] leading-tight font-medium' },
  { role: 'Page title', spec: 'Plex Sans 600, 18 px', sample: 'Interchain', cls: 'text-[18px] font-semibold' },
  { role: 'Section title', spec: 'Plex Sans 600, 14 px', sample: 'Stake distribution', cls: 'text-[14px] font-semibold' },
  { role: 'Body', spec: 'Plex Sans 400, 13 to 15 px', sample: 'It takes 26 validators to control a third of staked AVAX.', cls: 'text-[14px]' },
  { role: 'Caption', spec: 'Plex Sans 400, 11 to 12 px, muted', sample: 'Days are complete UTC days.', cls: 'text-[11px] text-muted-foreground' },
  { role: 'Number', spec: 'Plex Mono 400 to 500, tabular', sample: '205,843,013 AVAX', cls: 'num text-[22px]' },
];
const ASSETS = [
  { group: 'Full logo', files: ['logo-dark.svg', 'logo-light.svg', 'logo-dark-animated.svg', 'logo-light-animated.svg'] },
  { group: 'Icon', files: ['icon-dark.svg', 'icon-light.svg', 'icon-dark-animated.svg', 'icon-light-animated.svg'] },
  { group: 'Favicon', files: ['favicon.svg', 'favicon-animated.svg'] },
];
const WRITING = [
  ['Lead with the number', 'Each page opens with one sentence that says what the main figure is, in plain words.'],
  ['Sentence case', 'Titles, buttons and labels: "Stake distribution", not "Stake Distribution". No all-caps labels.'],
  ['Plain verbs', '"Bridged in", "Staked", "Sent to the C-Chain". Name things the way a reader would, not the way the system stores them.'],
  ['No em-dashes', 'Use a comma, a colon or a new sentence. A dash on its own only marks a value that has no data.'],
  ['Units and dates', 'Amounts carry their unit (AVAX, USD, messages). Dates read "Nov 3, 2026"; days and times are UTC.'],
  ['Frame it fairly', 'Describe spread and decentralization as they are, without alarm. Every chain live on mainnet is shown.'],
];

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1400);
    }).catch(() => {});
  };
  return { copied, copy };
}

function Swatch({ hex, copied, onCopy, label }: { hex: string; copied: boolean; onCopy: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      className="group flex items-center gap-2 min-w-0 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`Copy ${hex}`}
    >
      <span className="w-6 h-6 rounded-sm border border-border shrink-0" style={{ background: hex }} aria-hidden />
      <span className="num text-[12px] text-foreground">{hex}</span>
      {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
      <span className="text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </span>
    </button>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="px-4 sm:px-5 pt-4 pb-3">
        <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 max-w-3xl">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

export function BrandGuidelines() {
  const { copied, copy } = useCopy();

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      <SEO {...PAGE_SEO.brand} />
      <header>
        <h1 className="text-[18px] leading-6 font-semibold text-foreground">Brand</h1>
        <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
          L1Beat is built like an instrument: quiet surfaces, exact numbers, and red only when something drops.
        </p>
        <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
          The logo, colors, type and words we use, for anyone writing about L1Beat or building with its data.
        </p>
      </header>

      {/* Logo */}
      <Panel title="Logo" subtitle="A pulse line through network nodes: the heartbeat of Avalanche L1s. The pulse is always red and the wordmark takes the text color of the background it sits on.">
        <div className="grid grid-cols-1 md:grid-cols-2 border-t border-border md:divide-x divide-border">
          {(['dark', 'light'] as const).map((t) => (
            <div key={t} className="p-6 sm:p-8 flex flex-col items-center justify-center gap-6" style={{ background: t === 'dark' ? '#141619' : '#f5f6f7' }}>
              <L1BeatLogo size="large" theme={t} />
              <div className="flex items-center gap-6">
                <L1BeatLogo size="medium" iconOnly theme={t} />
                <L1BeatLogo size="small" iconOnly theme={t} />
              </div>
              <span className="text-[11px]" style={{ color: t === 'dark' ? '#9aa3ad' : '#626a73' }}>On {t} backgrounds</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] border-t border-border lg:divide-x divide-border">
          <div className="px-4 sm:px-5 py-4">
            <h3 className="text-[12px] font-medium text-foreground mb-2">Use it like this</h3>
            <ul className="space-y-1.5 text-[13px] text-muted-foreground">
              <li>Leave clear space around the logo at least the height of the icon.</li>
              <li>Use the dark version on dark backgrounds and the light one on light backgrounds.</li>
              <li>Below 24 px tall, use the icon on its own.</li>
              <li>Don't recolor the pulse, stretch the logo, add effects, or set the wordmark in another font.</li>
            </ul>
          </div>
          <div className="px-4 sm:px-5 py-4 border-t lg:border-t-0 border-border">
            <h3 className="text-[12px] font-medium text-foreground mb-2">Download</h3>
            <div className="space-y-2.5">
              {ASSETS.map((g) => (
                <div key={g.group} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="w-20 text-[11px] text-muted-foreground shrink-0">{g.group}</span>
                  {g.files.map((f) => (
                    <a key={f} href={`/${f}`} download={f} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-border text-[12px] text-foreground hover:bg-accent">
                      <Download className="w-3 h-3 text-muted-foreground" />
                      <span className="num">{f.replace('.svg', '')}</span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">SVG files. The animated versions are for screens; use the static ones for print.</p>
          </div>
        </div>
      </Panel>

      {/* Principles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          ['Numbers first', 'Figures are what people come for. They are set in IBM Plex Mono with even-width digits, larger than their labels, with nothing decorating them.'],
          ['Red means down', 'Red marks a drop, an error or a value under its limit, and appears in the logo. It is never a button color or decoration, so when it shows up it means something.'],
          ['Say what it shows', 'Every page and panel states its main finding in a plain sentence before the chart, so the chart confirms a point instead of asking the reader to find one.'],
        ].map(([t, d]) => (
          <section key={t} className="rounded-md border border-border bg-card px-4 sm:px-5 py-4">
            <h2 className="text-[14px] font-semibold text-foreground">{t}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{d}</p>
          </section>
        ))}
      </div>

      {/* Color */}
      <Panel title="Color" subtitle="Mostly ink and gray, so data colors stand out. Click a value to copy it.">
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-[12px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-border text-[11px] text-muted-foreground">
                <th className="text-left font-normal px-4 sm:px-5 py-2">Role</th>
                <th className="text-left font-normal px-3 py-2">Light</th>
                <th className="text-left font-normal px-3 py-2">Dark</th>
                <th className="text-left font-normal px-4 sm:px-5 py-2 hidden md:table-cell">Used for</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...SURFACES, ...SIGNALS].map((c, i) => (
                <tr key={c.name} className={i === SURFACES.length ? 'border-t-2 border-border' : ''}>
                  <td className="px-4 sm:px-5 py-2.5 text-[13px] text-foreground">{c.name}</td>
                  <td className="px-3 py-2.5"><Swatch hex={c.light} copied={copied === c.light} onCopy={() => copy(c.light)} /></td>
                  <td className="px-3 py-2.5"><Swatch hex={c.dark} copied={copied === c.dark} onCopy={() => copy(c.dark)} /></td>
                  <td className="px-4 sm:px-5 py-2.5 text-muted-foreground hidden md:table-cell">{c.use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border px-4 sm:px-5 py-4">
          <h3 className="text-[12px] font-medium text-foreground">Chart colors</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Series take these in order. Gray is kept for "other". Red is never a series color.</p>
          <div className="mt-3 flex h-3 rounded-sm overflow-hidden max-w-xl" aria-hidden>
            {CHART.map((c) => <span key={c.hex} className="flex-1" style={{ background: c.hex }} />)}
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {CHART.map((c, i) => (
              <Swatch key={c.hex} hex={c.hex} label={`${i + 1}. ${c.name}`} copied={copied === c.hex} onCopy={() => copy(c.hex)} />
            ))}
          </div>
        </div>
      </Panel>

      {/* Type */}
      <Panel title="Type" subtitle="IBM Plex Sans for words, IBM Plex Mono for every number, ID, hash and address. Both from Google Fonts: Sans at 400, 500 and 600, Mono at 400 and 500.">
        <div className="divide-y divide-border border-t border-border">
          {TYPE_SCALE.map((r) => (
            <div key={r.role} className="px-4 sm:px-5 py-3 grid grid-cols-1 md:grid-cols-[10rem_14rem_minmax(0,1fr)] gap-x-4 gap-y-1 items-baseline">
              <span className="text-[12px] text-foreground">{r.role}</span>
              <span className="num text-[11px] text-muted-foreground">{r.spec}</span>
              <span className={`text-foreground md:truncate ${r.cls}`}>{r.sample}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* Components */}
      <Panel title="Building blocks" subtitle="The same few pieces repeat on every page. These are the live components.">
        <div className="border-t border-border px-4 sm:px-5 py-4 space-y-5">
          <StatStrip
            items={[
              { label: 'AVAX staked', value: '205.8M', sub: '43.2% of total supply' },
              { label: 'Messages, 30d', value: '36.6K', sub: '1,219 a day on average' },
              { label: 'Network TPS', value: '17', delta: 13.6, deltaLabel: 'vs prior 24h' },
              { label: 'Validators', value: '567', sub: 'active' },
            ]}
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <h3 className="text-[12px] font-medium text-foreground">Split bar</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Two parts of one whole, in chart colors.</p>
              <div className="mt-3 flex h-2 rounded-sm overflow-hidden">
                <span style={{ width: '67%', background: '#3987e5' }} />
                <span style={{ width: '33%', background: '#8b5cf6' }} />
              </div>
              <div className="mt-1.5 flex gap-4 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#3987e5' }} />Own stake</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: '#8b5cf6' }} />Delegated</span>
              </div>
            </div>
            <div>
              <h3 className="text-[12px] font-medium text-foreground">Trend line</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Shape over time, no axes, next to a number.</p>
              <div className="mt-3 flex items-center gap-3">
                <Sparkline data={[4, 6, 5, 7, 6, 8, 7, 9, 8, 11, 10, 12]} color="#3987e5" fill />
                <span className="num text-[13px] text-foreground">12.4K</span>
              </div>
            </div>
            <div>
              <h3 className="text-[12px] font-medium text-foreground">Change</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Green up, red down, gray flat. Always with its window.</p>
              <div className="mt-3 flex items-center gap-4 text-[12px]">
                <Delta value={8.4} />
                <Delta value={-11.4} />
                <Delta value={0} />
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {/* Writing */}
      <Panel title="Writing" subtitle="Words are part of the interface. Each one should make a number easier to read.">
        <dl className="grid grid-cols-1 md:grid-cols-2 border-t border-border">
          {WRITING.map(([t, d], i) => (
            <div key={t} className={`px-4 sm:px-5 py-3 border-border ${i % 2 === 0 ? 'md:border-r' : ''} ${i >= 2 ? 'border-t' : i === 1 ? 'border-t md:border-t-0' : ''}`}>
              <dt className="text-[13px] font-medium text-foreground">{t}</dt>
              <dd className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{d}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <p className="text-[11px] text-muted-foreground">
        Questions about using the L1Beat name or logo: <a href="mailto:hello@l1beat.io" className="text-foreground hover:underline underline-offset-2">hello@l1beat.io</a>
      </p>
    </div>
  );
}
