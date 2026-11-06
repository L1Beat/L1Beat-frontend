import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, Copy, Mail } from 'lucide-react';
import { StatStrip } from '../components/instrument';
import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import {
  getChains,
  getNetworkActiveAddressesLatest,
  getNetworkTxCountLatest,
  getNetworkValidatorTotal,
  getTotalTxTracked,
} from '../api';

const EMAIL = 'hello@l1beat.io';
// Public C-Chain RPC. The limits mirror the nginx config in Icicle deploy/nginx; change both together.
const PUBLIC_RPC = 'https://rpc.l1beat.io/ext/bc/C/rpc';
const RPC_LIMITS = [
  '20 requests per second per IP, batches up to 10',
  'eth_getLogs up to 2,048 blocks with an address, 256 without',
  'No debug or trace calls, HTTPS only',
  'Best effort, no uptime guarantee',
];

const mailto = (subject: string) => `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`;

// The paid infrastructure offers, side by side at the top of the page.
const OFFERS: { eyebrow: string; title: string; body: string; points: string[]; subject: string; publicRpc?: boolean }[] = [
  {
    eyebrow: 'Live today on the C-Chain',
    title: 'Indexing as a service',
    body: 'Our indexer covers every C-Chain block from genesis and keeps up with the chain head. It powers the ICM, burn and DeFi data on l1beat.io. We can set up the same pipeline for your L1.',
    points: [
      'Every block from genesis, then kept at the chain head',
      'Daily transactions, active addresses, gas and fees',
      'ICM messages in and out of your chain',
      'Custom indexes for your contracts and events',
    ],
    subject: 'Indexing as a service',
  },
  {
    eyebrow: 'Running today: C-Chain archive node',
    title: 'Nodes and archive RPC',
    body: 'We run a C-Chain archive node with full historical state for our own indexing. We can run archive and RPC nodes for your L1 the same way.',
    points: [
      'Archive nodes with full historical state',
      'RPC and validator nodes for your L1',
      'Kept synced and upgraded before each network upgrade',
      'Monitoring and alerts on every node',
    ],
    subject: 'Nodes and archive RPC',
    publicRpc: true,
  },
  {
    eyebrow: 'For apps and partners',
    title: 'Enterprise API',
    body: 'The same data as the public API, with the limits and support a product needs when it depends on it.',
    points: [
      'Your own API keys',
      'Rate limits sized to your traffic',
      'Endpoints and fields built for your app',
      'A direct line to the people who run it',
    ],
    subject: 'Enterprise API',
  },
];

const SERVICES: {
  title: string;
  body: string;
  points: string[];
  link: { label: string; to?: string; href?: string };
}[] = [
  {
    title: 'Analytics on l1beat.io',
    body: 'Every Avalanche L1 live on mainnet has a public page with its activity, validators and cross-chain messages, updated daily.',
    points: ['Chain, validator and delegator pages', 'Interchain, staking and DeFi views', 'Free to use and to link to'],
    link: { label: 'Open the overview', to: '/' },
  },
  {
    title: 'Public API',
    body: 'The data behind the site, as REST and WebSocket endpoints. No key needed, so you can try it before you talk to us.',
    points: ['Chain metrics with up to a year of history', 'Validators, ICM and network totals', 'Live playground in the browser'],
    link: { label: 'Try the API', to: '/api' },
  },
  {
    title: 'Custom dashboards',
    body: 'Dashboards for your chain or app, built with the same components as l1beat.io. Hosted by us or embedded on your site.',
    points: ['The metrics your team and backers ask for', 'Your contracts and tokens, not only chain totals', 'Shareable links and preview cards'],
    link: { label: 'Ask about a dashboard', href: mailto('Custom dashboard') },
  },
  {
    title: 'Research and consulting',
    body: 'Reports and advice drawn from our data, on validator economics, cross-chain activity and how L1s grow after launch.',
    points: ['Launch and growth reports', 'Validator set and staking design', 'Ecosystem and grant reporting'],
    link: { label: 'Read our research', to: '/blog' },
  },
];

const STEPS = [
  ['Tell us about your chain', 'Send its name, chain ID and what you want to measure. Bring an RPC endpoint, or we run the node too.'],
  ['We backfill the history', 'We index from the first block, so your charts start at launch instead of the day you signed up.'],
  ['Your data goes live', 'Metrics appear on your l1beat.io page and in the API, and stay current from then on.'],
  ['We keep it running', 'Network upgrades and RPC changes are ours to handle, so your data keeps flowing.'],
];

const COMPARE: [string, string, string][] = [
  ['C-Chain RPC', 'Rate limited, no traces', 'Higher limits, debug and trace calls'],
  ['Access', 'Open, no key', 'Your own API keys'],
  ['Rate limits', 'Shared with everyone', 'Sized to your traffic'],
  ['Data', 'Chains L1Beat already tracks', 'Plus your chain, contracts and events'],
  ['History', 'Daily metrics per chain', 'From genesis'],
  ['Support', 'Best effort', 'Direct contact'],
  ['Price', 'Free', 'Quoted per chain'],
];

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

// undefined while loading, null when the call failed or came back empty.
type Live = number | null | undefined;

function useLiveStats() {
  const [stats, setStats] = useState<{
    total?: Live;
    totalChains?: number;
    chains?: Live;
    validators?: Live;
    tx?: Live;
    txChains?: number;
    addresses?: Live;
  }>({});
  useEffect(() => {
    let alive = true;
    const set = (patch: Partial<typeof stats>) => alive && setStats((s) => ({ ...s, ...patch }));
    getTotalTxTracked()
      .then((t) => set(t ? { total: t.value, totalChains: t.chainCount } : { total: null }))
      .catch(() => set({ total: null }));
    getNetworkActiveAddressesLatest()
      .then((a) => set({ addresses: a && a.value > 0 ? a.value : null }))
      .catch(() => set({ addresses: null }));
    getChains({ network: 'mainnet' })
      .then((c) => set({ chains: c.length > 0 ? c.length : null }))
      .catch(() => set({ chains: null }));
    getNetworkValidatorTotal()
      .then((v) => set({ validators: v.totalValidators > 0 ? v.totalValidators : null }))
      .catch(() => set({ validators: null }));
    getNetworkTxCountLatest()
      .then((t) => set(t && t.value > 0 ? { tx: t.value, txChains: t.chainCount } : { tx: null }))
      .catch(() => set({ tx: null }));
    return () => {
      alive = false;
    };
  }, []);
  return stats;
}

function ServiceLink({ link }: { link: { label: string; to?: string; href?: string } }) {
  const cls = 'inline-flex items-center gap-1 text-[13px] font-medium text-foreground hover:underline underline-offset-2';
  return link.to ? (
    <Link to={link.to} className={cls}>
      {link.label}
      <ArrowRight className="w-3.5 h-3.5" />
    </Link>
  ) : (
    <a href={link.href} className={cls}>
      {link.label}
      <ArrowUpRight className="w-3.5 h-3.5" />
    </a>
  );
}

function PublicRpc() {
  const [copied, setCopied] = useState(false);
  const done = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  // Fallback for browsers or embeds that refuse the async clipboard API.
  const legacyCopy = () => {
    const ta = document.createElement('textarea');
    ta.value = PUBLIC_RPC;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (ok) done();
  };
  const copy = () => {
    if (!navigator.clipboard) return legacyCopy();
    navigator.clipboard.writeText(PUBLIC_RPC).then(done, legacyCopy);
  };
  return (
    <div className="mt-4 rounded border border-border bg-muted/40 px-3 py-2.5">
      <p className="text-[12px] font-medium text-foreground">Public C-Chain archive RPC: free, no key</p>
      <div className="mt-1.5 flex items-start gap-2 min-w-0">
        <code className="num flex-1 min-w-0 break-all text-[12px] text-foreground">
          {PUBLIC_RPC}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Copy RPC URL"
        >
          {copied ? <Check className="w-3 h-3 text-up" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <ul className="mt-2 space-y-0.5">
        {RPC_LIMITS.map((l) => (
          <li key={l} className="text-[11px] leading-4 text-muted-foreground">
            {l}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-4 text-foreground/80">Need traces, higher limits or your own L1? Get a quote.</p>
    </div>
  );
}

function CheckList({ items, className = '' }: { items: string[]; className?: string }) {
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {items.map((p) => (
        <li key={p} className="flex gap-2 text-[13px] leading-5 text-muted-foreground">
          <Check className="w-3.5 h-3.5 mt-[3px] shrink-0 text-up" aria-hidden />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

export function Services() {
  const stats = useLiveStats();
  const dash = '—';

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-5">
      <SEO {...PAGE_SEO.services} />

      <header>
        <h1 className="text-[18px] leading-6 font-semibold text-foreground">Services</h1>
        <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
          We run an archive node and a full indexer for the Avalanche C-Chain, every block since genesis. We can run the same for your L1.
        </p>
        <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
          Nodes, archive RPC, indexing, APIs, dashboards and research for L1 teams, foundations and the apps built on them.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={mailto('Working with L1Beat')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded bg-foreground text-background hover:bg-foreground/90 text-[13px] font-medium transition-colors"
          >
            <Mail className="w-4 h-4" />
            Talk to us
          </a>
          <Link
            to="/api"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded border border-border text-[13px] font-medium text-foreground hover:bg-accent transition-colors"
          >
            Try the API
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      <StatStrip
        // A stat that failed to load is left out rather than shown as a dash.
        items={[
          {
            label: 'Transactions tracked',
            live: stats.total,
            value: stats.total ? compact.format(stats.total) : undefined,
            sub: stats.totalChains ? `all time, across ${stats.totalChains} chains` : 'all time',
            href: '/metrics',
          },
          {
            label: 'Transactions, last day',
            live: stats.tx,
            value: stats.tx ? compact.format(stats.tx) : undefined,
            sub: stats.txChains ? `across ${stats.txChains} chains` : 'across the network',
            href: '/metrics',
          },
          {
            label: 'Active addresses, last day',
            live: stats.addresses,
            value: stats.addresses ? compact.format(stats.addresses) : undefined,
            sub: 'across the network',
            href: '/metrics',
          },
          { label: 'L1s tracked', live: stats.chains, value: stats.chains?.toLocaleString('en-US'), sub: 'live on mainnet', href: '/' },
          { label: 'Validators', live: stats.validators, value: stats.validators?.toLocaleString('en-US'), sub: 'across every L1', href: '/staking' },
        ]
          .filter((i) => i.live !== null)
          .map((i) => ({ label: i.label, value: i.value ?? dash, sub: i.sub, href: i.href }))}
        footnote="Network data on l1beat.io today, live from the L1Beat API."
      />

      {/* Lead offer */}
      <section className="rounded-md border border-border bg-card">
        <div className="grid grid-cols-1 lg:grid-cols-3 lg:divide-x divide-border">
          {OFFERS.map((o, i) => (
            <div key={o.title} className={`flex flex-col px-4 sm:px-6 py-5 sm:py-6 border-border ${i > 0 ? 'border-t lg:border-t-0' : ''}`}>
              <p className="text-[12px] font-medium text-muted-foreground">{o.eyebrow}</p>
              <h2 className="mt-1 text-[20px] sm:text-[22px] leading-tight font-semibold text-foreground">{o.title}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-foreground/80 max-w-xl">{o.body}</p>
              {o.publicRpc && <PublicRpc />}
              <CheckList items={o.points} className="mt-4 mb-5" />
              <a
                href={mailto(o.subject)}
                className="mt-auto self-start inline-flex items-center gap-1.5 h-9 px-4 rounded bg-foreground text-background hover:bg-foreground/90 text-[13px] font-medium transition-colors"
              >
                <Mail className="w-4 h-4" />
                Get a quote
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Other services */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {SERVICES.map((s) => (
          <section key={s.title} className="flex flex-col rounded-md border border-border bg-card px-4 sm:px-5 py-4">
            <h2 className="text-[15px] font-semibold text-foreground">{s.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
            <CheckList items={s.points} className="mt-3 mb-4" />
            <div className="mt-auto pt-3 border-t border-border">
              <ServiceLink link={s.link} />
            </div>
          </section>
        ))}
      </div>

      {/* How it works */}
      <section className="rounded-md border border-border bg-card">
        <header className="px-4 sm:px-5 pt-4 pb-3">
          <h2 className="text-[14px] font-semibold text-foreground">How we'd index your chain</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">From first email to live data.</p>
        </header>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-t border-border">
          {STEPS.map(([t, d], i) => (
            <li
              key={t}
              className={`px-4 sm:px-5 py-4 border-border ${i > 0 ? 'border-t' : ''} sm:border-t-0 ${
                i % 2 === 1 ? 'sm:border-l' : ''
              } ${i >= 2 ? 'sm:border-t lg:border-t-0' : ''} ${i > 0 ? 'lg:border-l' : ''}`}
            >
              <span className="num text-[12px] text-muted-foreground">0{i + 1}</span>
              <h3 className="mt-1 text-[13px] font-medium text-foreground">{t}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Public vs enterprise */}
      <section className="rounded-md border border-border bg-card">
        <header className="px-4 sm:px-5 pt-4 pb-3">
          <h2 className="text-[14px] font-semibold text-foreground">Public API or enterprise</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Start on the public API. Move up when your product depends on it.</p>
        </header>
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-[11px] text-muted-foreground">
                <th className="w-[28%] text-left font-normal px-4 sm:px-5 py-2" />
                <th className="text-left font-normal px-3 py-2">Public</th>
                <th className="text-left font-normal px-4 sm:px-5 py-2">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COMPARE.map(([row, pub, ent]) => (
                <tr key={row}>
                  <td className="px-4 sm:px-5 py-2.5 text-[12px] text-muted-foreground align-top">{row}</td>
                  <td className="px-3 py-2.5 text-foreground/80 align-top">{pub}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-foreground align-top">{ent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-md border border-border bg-card px-4 sm:px-6 py-6 sm:py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="max-w-2xl">
          <h2 className="text-[20px] sm:text-[22px] leading-tight font-semibold text-foreground">Tell us about your chain</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">
            Send the chain's name, what you want to measure and when you need it. We'll come back with a plan and a
            quote.
          </p>
        </div>
        <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
          <a
            href={mailto('Working with L1Beat')}
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded bg-foreground text-background hover:bg-foreground/90 text-[14px] font-medium transition-colors"
          >
            <Mail className="w-4 h-4" />
            Email us
          </a>
          <a href={`mailto:${EMAIL}`} className="num text-[12px] text-muted-foreground hover:text-foreground">
            {EMAIL}
          </a>
        </div>
      </section>
    </div>
  );
}
