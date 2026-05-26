import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, GitFork, Send, Timer, Users } from 'lucide-react';
import { getChains, getTeleporterMessages } from '../api';
import type { TeleporterMessageData } from '../types';
import { TeleporterSankeyDiagram } from '../components/TeleporterSankeyDiagram';
import { LoadingSpinner } from '../components/LoadingSpinner';

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
  const lower = name.toLowerCase();
  if (lower.includes('c-chain') || lower === 'avalanche' || lower.includes('cchain')) {
    return '#ef4444';
  }
  const palette = ['#a855f7', '#22d3ee', '#f97316', '#22c55e', '#3b82f6', '#eab308', '#ec4899'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function isFallbackLogo(uri: string): boolean {
  if (!uri) return true;
  return /icon-(dark|light)-?animated/i.test(uri) || /l1beat.*logo/i.test(uri);
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(evm|chain|l1|subnet)$/, '');
}

function findLogo(name: string, map: Map<string, string>): string | undefined {
  const lower = name.toLowerCase().trim();
  if (map.has(lower)) return map.get(lower);
  const norm = normalize(name);
  if (!norm) return undefined;
  if (map.has(norm)) return map.get(norm);
  for (const [key, value] of map) {
    if (key === norm) return value;
    if (norm.length >= 4 && (key.includes(norm) || norm.includes(key))) {
      return value;
    }
  }
  return undefined;
}

export function Flows() {
  const [data, setData] = useState<TeleporterMessageData | null>(null);
  const [logoByChain, setLogoByChain] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      getTeleporterMessages(),
      getChains({ includeInactive: true }).catch(() => []),
    ])
      .then(([tele, chains]) => {
        if (!active) return;
        setData(tele);
        const map = new Map<string, string>();
        for (const c of chains) {
          if (!c.chainLogoUri || isFallbackLogo(c.chainLogoUri)) continue;
          const lower = c.chainName.toLowerCase().trim();
          map.set(lower, c.chainLogoUri);
          const norm = normalize(c.chainName);
          if (norm && !map.has(norm)) map.set(norm, c.chainLogoUri);
        }
        setLogoByChain(map);
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

  const allCorridors = useMemo((): Corridor[] => {
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
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [data]);

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <header>
        <div className="text-[11px] font-bold tracking-[0.15em] text-[#ef4444] mb-1.5">
          INTERCHAIN MESSAGING
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          What's moving between L1s?
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Teleporter &amp; ICM messages, live across active L1 subnets.
        </p>
      </header>

      <KpiStrip stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:items-stretch">
        <div className="lg:col-span-2 min-w-0">
          <TeleporterSankeyDiagram />
        </div>
        <CorridorRail
          corridors={allCorridors}
          totalCount={stats.total}
          totalCorridors={stats.corridors}
          logoByChain={logoByChain}
          loading={loading}
        />
      </div>
    </div>
  );
}

function CorridorRail({
  corridors,
  totalCount,
  totalCorridors,
  logoByChain,
  loading,
}: {
  corridors: Corridor[];
  totalCount: number;
  totalCorridors: number;
  logoByChain: Map<string, string>;
  loading: boolean;
}) {
  const PAGE_SIZE = 8;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(corridors.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const visible = corridors.slice(start, start + PAGE_SIZE);
  const top = corridors[0]?.count || 1;

  return (
    <aside className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
      <header className="flex items-center justify-between gap-4 px-4 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold text-foreground">Top corridors</h2>
          <div className="flex items-center gap-1.5 px-2 h-5 rounded-full bg-green-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] font-bold tracking-wider text-green-500">LIVE</span>
          </div>
        </div>
        <span className="text-[10px] font-bold tracking-wider text-muted-foreground">
          {corridors.length || totalCorridors}
        </span>
      </header>
      {loading ? (
        <div className="flex-1 flex items-center justify-center px-6 py-16">
          <LoadingSpinner size="md" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 py-16 text-center text-muted-foreground text-sm">
          No corridors active in this window.
        </div>
      ) : (
        <>
          <div className="flex-1">
            <CorridorList
              corridors={visible}
              totalCount={totalCount}
              logoByChain={logoByChain}
              top={top}
              startIndex={start}
            />
          </div>
          {totalPages > 1 && (
            <footer className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border shrink-0">
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {start + 1}–{Math.min(start + PAGE_SIZE, corridors.length)} of {corridors.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="inline-flex items-center justify-center w-6 h-6 rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Previous"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="text-[10px] font-semibold tabular-nums text-foreground w-7 text-center">
                  {safePage + 1}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage === totalPages - 1}
                  className="inline-flex items-center justify-center w-6 h-6 rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Next"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </footer>
          )}
        </>
      )}
    </aside>
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

function CorridorList({
  corridors,
  totalCount,
  logoByChain,
  top,
  startIndex = 0,
}: {
  corridors: Corridor[];
  totalCount: number;
  logoByChain: Map<string, string>;
  top?: number;
  startIndex?: number;
}) {
  const maxCount = top ?? corridors[0]?.count ?? 1;
  return (
    <ul className="divide-y divide-border/60">
      {corridors.map((c, idx) => {
        const share = totalCount > 0 ? (c.count / totalCount) * 100 : 0;
        const barWidth = Math.max(2, (c.count / maxCount) * 100);
        const sourceColor = chainColor(c.source);
        const targetColor = chainColor(c.target);
        const rank = startIndex + idx + 1;
        return (
          <li
            key={`${c.source}-${c.target}`}
            className="group px-4 py-3 hover:bg-[#ef4444]/[0.04] transition-colors"
          >
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold tabular-nums text-muted-foreground w-4">
                  {rank}
                </span>
                <div className="flex shrink-0">
                  <ChainAvatar name={c.source} logoByChain={logoByChain} />
                  <ChainAvatar name={c.target} logoByChain={logoByChain} stacked />
                </div>
                <div className="flex items-center gap-1 min-w-0 text-[12px] font-semibold text-foreground">
                  <span className="truncate">{formatChainName(c.source)}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="truncate">{formatChainName(c.target)}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[12px] font-bold tabular-nums text-foreground">
                  {formatCount(c.count)}
                </div>
                <div className="text-[10px] tabular-nums text-muted-foreground">
                  {share >= 0.1 ? `${share.toFixed(1)}%` : '<0.1%'}
                </div>
              </div>
            </div>
            <div className="h-1 rounded-full bg-muted/40 overflow-hidden ml-6">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${barWidth}%`,
                  background: `linear-gradient(to right, ${sourceColor}, ${targetColor})`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ChainAvatar({
  name,
  logoByChain,
  stacked,
}: {
  name: string;
  logoByChain: Map<string, string>;
  stacked?: boolean;
}) {
  const display = formatChainName(name);
  const logo = findLogo(name, logoByChain) || findLogo(display, logoByChain);
  const cls = `w-6 h-6 rounded-full ring-2 ring-card overflow-hidden bg-muted shrink-0 ${stacked ? '-ml-2' : ''}`;
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        title={display}
        className={`${cls} object-cover`}
        loading="lazy"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    );
  }
  return (
    <span
      className={cls}
      style={{ background: chainColor(name) }}
      title={display}
    />
  );
}

