import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  GitFork,
  Send,
  Timer,
  Users,
} from 'lucide-react';
import { getTeleporterMessages } from '../api';
import type { TeleporterMessageData } from '../types';
import { TeleporterSankeyDiagram } from '../components/TeleporterSankeyDiagram';
import { LoadingSpinner } from '../components/LoadingSpinner';

type Range = '24H' | '7D' | '30D' | 'ALL';
const RANGES: Range[] = ['24H', '7D', '30D', 'ALL'];

interface Corridor {
  source: string;
  target: string;
  count: number;
}

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatChainName(name: string): string {
  if (!name) return 'Unknown';
  const lower = name.toLowerCase();
  if (lower.includes('c-chain') || lower.includes('cchain')) return 'Avalanche C-Chain';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function chainColor(name: string): string {
  const palette = ['#ef4444', '#a855f7', '#22d3ee', '#f97316', '#22c55e', '#3b82f6', '#eab308', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

export function Flows() {
  const [data, setData] = useState<TeleporterMessageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('24H');

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTeleporterMessages()
      .then((res) => {
        if (active) setData(res);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (!data?.messages?.length) {
      return { total: 0, corridors: 0, sources: 0, targets: 0 };
    }
    const corridorSet = new Set<string>();
    const sources = new Set<string>();
    const targets = new Set<string>();
    let total = 0;
    for (const m of data.messages) {
      corridorSet.add(`${m.source}->${m.target}`);
      sources.add(m.source);
      targets.add(m.target);
      total += m.value;
    }
    return {
      total,
      corridors: corridorSet.size,
      sources: sources.size,
      targets: targets.size,
    };
  }, [data]);

  const corridors = useMemo((): Corridor[] => {
    if (!data?.messages?.length) return [];
    const map = new Map<string, Corridor>();
    for (const m of data.messages) {
      const key = `${m.source}->${m.target}`;
      const existing = map.get(key);
      if (existing) {
        existing.count += m.value;
      } else {
        map.set(key, { source: m.source, target: m.target, count: m.value });
      }
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }, [data]);

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-bold tracking-[0.15em] text-[#ef4444] mb-1.5">
            INTERCHAIN MESSAGING
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            What's moving between L1s?
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Teleporter &amp; ICM messages, live across active L1 subnets.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => {
            const active = r === range;
            return (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors border ${
                  active
                    ? 'bg-[#ef4444]/15 border-[#ef4444]/30 text-[#ef4444]'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </header>

      <KpiStrip stats={stats} />

      <section className="rounded-xl border border-white/[0.08] bg-[#1c1c1e] shadow-xl shadow-black/40 overflow-hidden">
        <header className="flex items-center justify-between gap-4 px-5 pt-5 pb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitFork className="w-4 h-4 text-[#ef4444]" />
              <h2 className="text-[15px] font-semibold text-foreground">Cross-chain message flows</h2>
              <div className="flex items-center gap-1.5 px-2 h-5 rounded-full bg-green-500/10">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-[10px] font-bold tracking-wider text-green-500">LIVE</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Teleporter &amp; ICM corridors · drag the nodes to explore
            </p>
          </div>
        </header>
        <div className="px-2 pb-2">
          <TeleporterSankeyDiagram />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <header className="flex items-center justify-between gap-4 px-4 sm:px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-foreground">Top corridors</h2>
            <div className="flex items-center gap-1.5 px-2 h-5 rounded-full bg-green-500/10">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-bold tracking-wider text-green-500">LIVE</span>
            </div>
          </div>
        </header>
        {loading ? (
          <div className="px-6 py-16 flex items-center justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : corridors.length === 0 ? (
          <div className="px-6 py-16 text-center text-muted-foreground text-sm">
            No corridors active in this window.
          </div>
        ) : (
          <CorridorTable corridors={corridors} totalCount={stats.total} />
        )}
      </section>
    </div>
  );
}

function KpiStrip({
  stats,
}: {
  stats: { total: number; corridors: number; sources: number; targets: number };
}) {
  const cards = [
    {
      label: 'Messages (24h)',
      value: stats.total > 0 ? formatCount(stats.total) : '—',
      icon: Send,
    },
    {
      label: 'Active corridors',
      value: stats.corridors > 0 ? stats.corridors.toLocaleString() : '—',
      icon: GitFork,
    },
    {
      label: 'Unique senders',
      value: stats.sources > 0 ? stats.sources.toLocaleString() : '—',
      icon: Users,
    },
    {
      label: 'Destinations',
      value: stats.targets > 0 ? stats.targets.toLocaleString() : '—',
      icon: Timer,
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">{label}</span>
            <div className="w-7 h-7 rounded-lg bg-[#ef4444]/10 flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-[#ef4444]" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground tracking-tight">{value}</div>
        </div>
      ))}
    </div>
  );
}

function CorridorTable({ corridors, totalCount }: { corridors: Corridor[]; totalCount: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <Th className="pl-5">Corridor</Th>
            <Th align="right">Messages</Th>
            <Th align="right">Share</Th>
            <Th align="right" className="pr-5">
              <span className="sr-only">Open</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {corridors.map((c, idx) => {
            const share = totalCount > 0 ? (c.count / totalCount) * 100 : 0;
            const isLast = idx === corridors.length - 1;
            return (
              <tr
                key={`${c.source}-${c.target}`}
                className={`group transition-colors hover:bg-[#ef4444]/[0.04] ${
                  isLast ? '' : 'border-b border-border/60'
                }`}
              >
                <td className="py-3 pl-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex shrink-0">
                      <span
                        className="w-6 h-6 rounded-full ring-2 ring-card"
                        style={{ background: chainColor(c.source) }}
                        title={formatChainName(c.source)}
                      />
                      <span
                        className="w-6 h-6 rounded-full ring-2 ring-card -ml-2"
                        style={{ background: chainColor(c.target) }}
                        title={formatChainName(c.target)}
                      />
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-semibold text-foreground truncate">
                        {formatChainName(c.source)}
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[13px] font-semibold text-foreground truncate">
                        {formatChainName(c.target)}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="py-3 text-right tabular-nums text-[13px] font-medium text-foreground">
                  {formatCount(c.count)}
                </td>
                <td className="py-3 text-right tabular-nums text-[12px] text-muted-foreground">
                  {share >= 0.1 ? `${share.toFixed(1)}%` : '<0.1%'}
                </td>
                <td className="py-3 pr-5 text-right">
                  <Activity className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      className={`py-2.5 text-[10px] font-bold tracking-wider uppercase text-muted-foreground ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${className}`}
    >
      {children}
    </th>
  );
}
