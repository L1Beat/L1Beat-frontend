import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { SEO } from '../components/SEO';
import { SegmentedControl, StatStrip, UpdatedAgo } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { getLending } from '../api';
import type { Lending as LendingData, LendingMarket } from '../api';

// One colour per protocol, as on the Staking page's lending card.
const PROTOCOL_STYLE: Record<string, { color: string; opacity: number }> = {
  'aave-v3': { color: '#d95926', opacity: 1 },
  'aave-v4': { color: '#d95926', opacity: 0.5 },
  benqi: { color: '#199e70', opacity: 1 },
};
const protocolStyle = (id: string) => PROTOCOL_STYLE[id] ?? { color: '#6b7280', opacity: 1 };
const SUPPLIED = '#3987e5';

// Below this, a market's rates are noise (a $5 FRAX market can show 67%).
const MIN_COMPARE_USD = 100_000;

function compact(v: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  const a = Math.abs(v);
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}K`;
  return Math.round(v).toLocaleString();
}
const usd = (v: number | null | undefined) => (v == null ? '—' : `$${compact(v)}`);
const apy = (v: number | null | undefined) => (v == null ? '—' : v <= 0 ? '0%' : v < 0.1 ? '<0.1%' : `${v.toFixed(1)}%`);
/** A 0% borrow rate with nothing borrowed means borrowing is off, not free. */
const borrowApy = (m: LendingMarket) => (!m.borrow_apy_percent && !Number(m.total_borrowed) ? '—' : apy(m.borrow_apy_percent));
const pct = (v: number | null | undefined, d = 0) => (v == null ? '—' : `${v.toFixed(d)}%`);

/** WAVAX on Aave and native AVAX on BENQI are the same asset to a user. */
const assetKey = (m: LendingMarket) => (m.symbol === 'WAVAX' ? 'AVAX' : m.symbol);

type CapUse = { kind: 'none' } | { kind: 'closed' } | { kind: 'pct'; value: number };
/** How much of a cap is used. A cap of one whole token or less marks a market being wound down. */
function capUse(cap: string | null, amount: string, decimals: number): CapUse {
  if (cap == null) return { kind: 'none' };
  const capTokens = Number(cap) / 10 ** decimals;
  if (!(capTokens > 1)) return { kind: 'closed' };
  return { kind: 'pct', value: (Number(amount) / 10 ** decimals / capTokens) * 100 };
}

/**
 * How an asset works as collateral right now. An LTV of 0 with a liquidation
 * threshold above 0 means new borrowing against it is switched off while
 * existing positions stay open.
 */
function collateralState(m: LendingMarket) {
  const groups = (m.emode ?? []).filter((e) => e.as_collateral);
  const usable = groups.filter((e) => (e.ltv_percent ?? 0) > 0).sort((a, b) => (b.ltv_percent ?? 0) - (a.ltv_percent ?? 0))[0];
  const pausedGroup = groups.find((e) => !(e.ltv_percent ?? 0) && ((e.configured_ltv_percent ?? 0) > 0 || (e.previous_ltv_percent ?? 0) > 0));
  if (m.protocol_id === 'aave-v4') {
    // V4 sets collateral per spoke, so the spokes are the whole story.
    if (usable) return { kind: 'ok' as const, ltv: usable.ltv_percent, liq: usable.liquidation_threshold_percent, note: usable.label };
    // A spoke that dropped the asset to 0 reports it as not collateral but keeps
    // the factor older positions still use.
    const was = Math.max(0, ...(m.emode ?? []).map((e) => e.previous_ltv_percent ?? e.configured_ltv_percent ?? 0));
    if (was > 0) return { kind: 'paused' as const, liq: null, was, note: null };
    return { kind: 'unknown' as const };
  }
  if (m.collateral_enabled === false) return { kind: 'none' as const };
  if (m.ltv_percent == null && m.liquidation_threshold_percent == null) return { kind: 'unknown' as const };
  if (!m.ltv_percent && (m.liquidation_threshold_percent ?? 0) > 0) {
    // No "was" here: the API carries the E-Mode value before the change, not the
    // normal-mode LTV, and quoting one as the other would overstate it.
    return {
      kind: 'paused' as const,
      liq: m.liquidation_threshold_percent,
      was: null,
      note: usable ? `E-Mode ${pct(usable.ltv_percent)} (${usable.label})` : pausedGroup ? 'E-Mode paused too' : null,
    };
  }
  return {
    kind: 'ok' as const,
    ltv: m.ltv_percent,
    liq: m.liquidation_threshold_percent,
    note: usable ? `E-Mode ${pct(usable.ltv_percent)}` : null,
  };
}

interface Row extends LendingMarket {
  protocolName: string;
  asset: string;
  supplyCap: CapUse;
  borrowCap: CapUse;
  closed: boolean;
}

export function Lending() {
  const [data, setData] = useState<LendingData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    getLending().then((r) => {
      if (!alive) return;
      setData(r);
      setState(r ? 'ready' : 'error');
      setLoadedAt(Date.now());
    });
    return () => {
      alive = false;
    };
  }, []);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const name = (id: string) => data.protocols.find((p) => p.id === id)?.name ?? id;
    return data.markets.map((m) => {
      const supplyCap = capUse(m.supply_cap, m.total_supplied, m.decimals);
      const borrowCap = capUse(m.borrow_cap, m.total_borrowed, m.decimals);
      return {
        ...m,
        protocolName: name(m.protocol_id),
        asset: assetKey(m),
        supplyCap,
        borrowCap,
        closed: supplyCap.kind === 'closed' && (borrowCap.kind === 'closed' || borrowCap.kind === 'none'),
      };
    });
  }, [data]);

  const totals = data?.summary.totals;
  const live = rows.filter((r) => !r.closed && (r.supplied_usd ?? 0) > 0);
  const utilization = totals && totals.supplied_usd > 0 ? (totals.borrowed_usd / totals.supplied_usd) * 100 : null;
  const byProtocol = (totals?.by_protocol ?? [])
    .map((p) => ({ ...p, name: data?.protocols.find((x) => x.id === p.protocol_id)?.name ?? p.protocol_id }))
    .sort((a, b) => b.supplied_usd - a.supplied_usd);

  const stats: StatItem[] = totals
    ? [
        { label: 'Supplied', value: usd(totals.supplied_usd), sub: `${data?.protocols.length ?? 0} protocols` },
        { label: 'Borrowed', value: usd(totals.borrowed_usd), sub: utilization != null ? `${pct(utilization)} of what's supplied` : ' ' },
        { label: 'Available to borrow', value: usd(totals.supplied_usd - totals.borrowed_usd), sub: 'supplied minus borrowed' },
        { label: 'Markets', value: String(live.length), sub: 'with deposits, not winding down' },
      ]
    : ['Supplied', 'Borrowed', 'Available to borrow', 'Markets'].map((label) => ({ label, value: '—', sub: state === 'error' ? 'Unavailable' : ' ' }));

  return (
    <div>
      <SEO
        title="Avalanche Lending Markets"
        description="Supply and borrow rates, utilization and caps for every lending market on Aave V3, Aave V4 and BENQI on the Avalanche C-Chain, read from the contracts."
        url="/lending"
      />

      {/* Hero in the shared page frame: the chart fills the stage and the KPIs
          float over its foot from md up. */}
      <section
        className="relative border-b border-border bg-stage md:h-[min(calc(100vh-48px),820px)] md:min-h-[600px]"
        aria-label="Supplied and borrowed by asset"
      >
        <div className="md:absolute md:inset-0 flex flex-col">
          <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-[18px] leading-6 font-semibold text-foreground">Lending</h1>
              {totals ? (
                <>
                  <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                    Avalanche lending markets hold <span className="tabular-nums">{usd(totals.supplied_usd)}</span>, and{' '}
                    <span className="tabular-nums">{usd(totals.borrowed_usd)}</span> of it is borrowed.
                  </p>
                  <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                    {byProtocol.map((p, i) => (
                      <span key={p.protocol_id}>
                        {i > 0 && (i === byProtocol.length - 1 ? ' and ' : ', ')}
                        {p.name} <span className="num">{usd(p.supplied_usd)}</span>
                      </span>
                    ))}
                    , across <span className="num">{live.length}</span> active markets.
                  </p>
                </>
              ) : state === 'error' ? (
                <p className="mt-3 text-[13px] text-muted-foreground">Lending data couldn't be loaded. Try again in a minute.</p>
              ) : (
                <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
              )}
            </div>
            <div className="flex flex-col gap-2 sm:items-end shrink-0">
              <UpdatedAgo at={loadedAt} />
              <span className="inline-flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: SUPPLIED }} />
                  Borrowed
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: SUPPLIED, opacity: 0.25 }} />
                  Not borrowed
                </span>
              </span>
            </div>
          </div>

          <div className="relative md:flex-1 md:min-h-0 mx-4 sm:mx-6 lg:mx-10 mt-5 mb-6 md:mt-4 md:mb-[128px]">
            <SectionErrorBoundary label="the supplied and borrowed chart">
              <AssetChart rows={rows} loading={state === 'loading'} />
            </SectionErrorBoundary>
          </div>
        </div>
        <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(960px,calc(100%-3rem))]">
          <StatStrip items={stats} floating />
        </div>
      </section>

      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 space-y-5">
        <div className="md:hidden">
          <StatStrip items={stats} />
        </div>
        {state === 'ready' && data && (
          <>
            <PausedNotice rows={rows} />
            <SectionErrorBoundary label="the rate comparison">
              <RatesCard rows={rows} />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="markets near their limits">
              <LimitsCard rows={rows} />
            </SectionErrorBoundary>
            <SectionErrorBoundary label="the market table">
              <MarketsTable rows={rows} protocols={data.protocols} />
            </SectionErrorBoundary>
          </>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground max-w-4xl">
          Read from each protocol's contracts every few minutes and priced with each protocol's own oracle. Rates are variable
          APYs. Aave V4's borrow rate is its base rate, which borrowers pay a premium on top of, and its supply rate is an
          estimate. Liquidations and history are being indexed and will be added here.
        </p>
      </div>
    </div>
  );
}

// Supplied per asset across protocols, with the borrowed share filled in.
function AssetChart({ rows, loading }: { rows: Row[]; loading: boolean }) {
  const assets = useMemo(() => {
    const by = new Map<string, { asset: string; supplied: number; borrowed: number; protocols: Set<string> }>();
    for (const r of rows) {
      if (r.closed || !r.supplied_usd) continue;
      const a = by.get(r.asset) ?? { asset: r.asset, supplied: 0, borrowed: 0, protocols: new Set<string>() };
      a.supplied += r.supplied_usd ?? 0;
      a.borrowed += r.borrowed_usd ?? 0;
      a.protocols.add(r.protocolName);
      by.set(r.asset, a);
    }
    return [...by.values()].sort((a, b) => b.supplied - a.supplied).slice(0, 10);
  }, [rows]);
  const max = Math.max(...assets.map((a) => a.supplied), 1);

  if (loading) {
    return (
      <div className="md:h-full flex flex-col justify-around gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-7 rounded bg-muted/50 animate-pulse" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    );
  }
  if (!assets.length) return null;

  return (
    <ol className="md:h-full flex flex-col justify-around gap-4 md:gap-1.5">
      {assets.map((a) => {
        const share = a.supplied > 0 ? (a.borrowed / a.supplied) * 100 : 0;
        return (
          <li key={a.asset} className="grid grid-cols-[1fr_auto] sm:grid-cols-[110px_1fr_190px] items-center gap-x-4 gap-y-1.5">
            <div className="min-w-0">
              <div className="num text-[14px] font-medium text-foreground truncate">{a.asset}</div>
              <div className="text-[10px] text-muted-foreground truncate sm:hidden">{[...a.protocols].join(', ')}</div>
            </div>
            <div className="order-3 col-span-2 sm:order-none sm:col-span-1 relative h-5 sm:h-7" title={[...a.protocols].join(', ')}>
              <div
                className="absolute inset-y-0 left-0 rounded-[2px] overflow-hidden"
                style={{ width: `max(${(a.supplied / max) * 100}%, 3px)`, background: `color-mix(in srgb, ${SUPPLIED} 25%, transparent)` }}
              >
                <div className="h-full" style={{ width: `${share}%`, background: SUPPLIED }} />
              </div>
            </div>
            <div className="text-right sm:text-left min-w-0">
              <div className="num text-[14px] sm:text-[15px] leading-5 text-foreground whitespace-nowrap">{usd(a.supplied)}</div>
              <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                <span className="num">{usd(a.borrowed)}</span> borrowed, <span className="num">{pct(share)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Card({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-card">
      <header className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function ProtocolDot({ id }: { id: string }) {
  const st = protocolStyle(id);
  return <span className="w-2 h-2 rounded-[2px] shrink-0 inline-block" style={{ background: st.color, opacity: st.opacity }} aria-hidden />;
}

// The same asset across protocols, answered in words: where it pays most to
// supply, where it's cheapest to borrow, and what the alternatives charge.
function RatesCard({ rows }: { rows: Row[] }) {
  const assets = useMemo(() => {
    const by = new Map<string, Row[]>();
    for (const r of rows) {
      if (r.closed || (r.supplied_usd ?? 0) < MIN_COMPARE_USD) continue;
      by.set(r.asset, [...(by.get(r.asset) ?? []), r]);
    }
    return [...by.entries()]
      .filter(([, list]) => list.length > 1)
      .map(([asset, list]) => {
        const supplies = list
          .filter((r) => r.supply_apy_percent != null)
          .sort((a, b) => (b.supply_apy_percent ?? 0) - (a.supply_apy_percent ?? 0));
        // Only markets people actually borrow from. Aave V4 quotes a base rate before
        // each borrower's premium, so it's listed but can't be the cheapest.
        const borrows = list
          .filter((r) => r.borrow_apy_percent != null && (r.borrowed_usd ?? 0) >= MIN_COMPARE_USD && r.borrowCap.kind !== 'closed')
          .sort((a, b) => (a.borrow_apy_percent ?? 0) - (b.borrow_apy_percent ?? 0));
        const bestSupply = (supplies[0]?.supply_apy_percent ?? 0) >= 0.05 ? supplies[0] : undefined;
        const bestBorrow = borrows.find((r) => r.protocol_id !== 'aave-v4');
        return {
          asset,
          bestSupply,
          otherSupplies: supplies.filter((r) => r !== bestSupply),
          bestBorrow,
          otherBorrows: borrows.filter((r) => r !== bestBorrow),
          size: list.reduce((s, r) => s + (r.supplied_usd ?? 0), 0),
        };
      })
      // Nothing to compare when no protocol pays to supply and nobody borrows it.
      .filter((a) => a.bestSupply || a.bestBorrow)
      .sort((a, b) => b.size - a.size);
  }, [rows]);

  if (!assets.length) return null;
  const others = (list: Row[], key: 'supply_apy_percent' | 'borrow_apy_percent') =>
    list.length === 0
      ? 'Only option'
      : list
          .map((r) => `${r.protocolName.replace(' Lending', '')} ${apy(r[key])}${key === 'borrow_apy_percent' && r.protocol_id === 'aave-v4' ? ' + premium' : ''}`)
          .join(', ');
  const best = (r: Row | undefined, key: 'supply_apy_percent' | 'borrow_apy_percent', none: string) =>
    r ? (
      <span className="inline-flex items-baseline gap-2">
        <span className="num text-[15px] font-medium text-foreground">{apy(r[key])}</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground/90">
          <ProtocolDot id={r.protocol_id} />
          {r.protocolName.replace(' Lending', '')}
        </span>
      </span>
    ) : (
      <span className="text-[12px] text-muted-foreground">{none}</span>
    );

  return (
    <Card title="Rates by asset" subtitle="For assets on more than one protocol: where supplying pays the most and where borrowing costs the least, with the other options beside it.">
      <div className="hidden md:grid grid-cols-[100px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-x-6 px-5 py-2 border-y border-border text-[11px] text-muted-foreground">
        <span>Asset</span>
        <span>Best to supply</span>
        <span>Other options</span>
        <span>Cheapest to borrow</span>
        <span>Other options</span>
      </div>
      <ul className="divide-y divide-border border-t border-border md:border-t-0">
        {assets.map((a) => (
          <li key={a.asset} className="px-4 sm:px-5 py-3 md:py-2.5">
            {/* Phones: two sentences per asset. */}
            <div className="md:hidden space-y-1.5">
              <div className="num text-[14px] font-medium text-foreground">{a.asset}</div>
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="text-muted-foreground shrink-0">Supply</span>
                {best(a.bestSupply, 'supply_apy_percent', 'Pays nearly nothing')}
              </div>
              {a.bestSupply && a.otherSupplies.length > 0 && (
                <div className="text-right text-[11px] text-muted-foreground">{others(a.otherSupplies, 'supply_apy_percent')}</div>
              )}
              <div className="flex items-baseline justify-between gap-3 text-[12px]">
                <span className="text-muted-foreground shrink-0">Borrow</span>
                {best(a.bestBorrow, 'borrow_apy_percent', 'Hardly borrowed')}
              </div>
              {a.bestBorrow && a.otherBorrows.length > 0 && (
                <div className="text-right text-[11px] text-muted-foreground">{others(a.otherBorrows, 'borrow_apy_percent')}</div>
              )}
            </div>
            <div className="hidden md:grid grid-cols-[100px_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-x-6 items-baseline">
              <span className="num text-[13px] font-medium text-foreground">{a.asset}</span>
              {best(a.bestSupply, 'supply_apy_percent', 'Pays nearly nothing')}
              <span className="num text-[12px] text-muted-foreground truncate">{a.bestSupply ? others(a.otherSupplies, 'supply_apy_percent') : ''}</span>
              {best(a.bestBorrow, 'borrow_apy_percent', 'Hardly borrowed')}
              <span className="num text-[12px] text-muted-foreground truncate">{a.bestBorrow ? others(a.otherBorrows, 'borrow_apy_percent') : ''}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="px-4 sm:px-5 py-2.5 border-t border-border text-[11px] text-muted-foreground">
        Variable APYs. Aave V4 shows its base borrow rate; each borrower pays a premium on top, so it isn't ranked cheapest.
        Markets under $100K are left out.
      </p>
    </Card>
  );
}

// Lenders sometimes switch off new borrowing against an asset (LTV to 0) as a risk
// measure. Said once, up top, so the table's "Paused" cells make sense.
function PausedNotice({ rows }: { rows: Row[] }) {
  const paused = rows.filter((r) => !r.closed && (r.supplied_usd ?? 0) >= MIN_COMPARE_USD && collateralState(r).kind === 'paused');
  if (!paused.length) return null;
  const assets = [...new Set(paused.map((r) => r.asset))];
  const protocols = [...new Set(paused.map((r) => r.protocolName.replace(' Lending', '')))];
  const list = (xs: string[]) => (xs.length <= 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  return (
    <div className="flex items-start gap-3 rounded-md border border-[#d4a017]/40 bg-[#d4a017]/[0.07] px-4 py-3">
      <span className="mt-1.5 w-2 h-2 rounded-full bg-[#d4a017] shrink-0" aria-hidden />
      <p className="text-[13px] leading-5 text-foreground">
        New borrowing against <span className="font-medium">{list(assets)}</span> is switched off on {list(protocols)}: their
        loan-to-value is set to 0. Existing positions keep their liquidation thresholds, so the change doesn't liquidate
        anyone.
      </p>
    </div>
  );
}

// Markets where depositing, withdrawing or borrowing is about to get harder.
function LimitsCard({ rows }: { rows: Row[] }) {
  const items = useMemo(() => {
    const out: { r: Row; reason: string; level: number }[] = [];
    for (const r of rows) {
      if (r.closed || (r.supplied_usd ?? 0) < MIN_COMPARE_USD) continue;
      const s = r.supplyCap.kind === 'pct' ? r.supplyCap.value : null;
      const b = r.borrowCap.kind === 'pct' ? r.borrowCap.value : null;
      const u = r.utilization_percent;
      if (s != null && s >= 100) out.push({ r, reason: 'Over its supply cap, so new deposits are blocked', level: s });
      else if (b != null && b >= 100) out.push({ r, reason: 'Borrow cap reached, so new borrowing is blocked', level: b });
      else if (s != null && s >= 95) out.push({ r, reason: `Supply cap ${pct(s)} used`, level: s });
      else if (b != null && b >= 95) out.push({ r, reason: `Borrow cap ${pct(b)} used`, level: b });
      else if (u != null && u >= 85) out.push({ r, reason: `${pct(u)} of deposits lent out, so large withdrawals may have to wait`, level: u });
    }
    return out.sort((a, b) => b.level - a.level);
  }, [rows]);

  return (
    <Card title="Near their limits" subtitle="Markets at or close to a cap, or with most deposits lent out. Rates usually rise here.">
      {items.length === 0 ? (
        <div className="px-5 pb-5 text-[12px] text-muted-foreground">No market is close to a cap or heavily borrowed right now.</div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {items.map(({ r, reason }) => (
            <li key={r.market + r.asset} className="px-4 sm:px-5 py-2.5 grid grid-cols-1 sm:grid-cols-[220px_1fr_auto] gap-x-4 gap-y-1 items-center">
              <span className="inline-flex items-center gap-2 min-w-0">
                <ProtocolDot id={r.protocol_id} />
                <span className="num text-[13px] font-medium text-foreground">{r.asset}</span>
                <span className="text-[12px] text-muted-foreground truncate">{r.protocolName}</span>
              </span>
              <span className="text-[12px] text-foreground/90">{reason}</span>
              <span className="num text-[11px] text-muted-foreground whitespace-nowrap sm:text-right">
                {apy(r.supply_apy_percent)} supply, {borrowApy(r)} borrow
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CollateralCell({ r }: { r: Row }) {
  const c = collateralState(r);
  if (c.kind === 'none') return <span className="text-[12px] text-muted-foreground">Not collateral</span>;
  if (c.kind === 'unknown') return <span className="text-muted-foreground/50">—</span>;
  if (c.kind === 'paused') {
    return (
      <span className="inline-flex flex-col items-end leading-tight" title="New borrowing against this asset is switched off (LTV 0). Existing positions keep the liquidation threshold.">
        <span className="text-[12px] text-[#d4a017]">Paused{c.was != null ? ` (was ${pct(c.was)})` : ''}</span>
        {(c.liq != null || c.note) && (
          <span className="num text-[10px] text-muted-foreground">{[c.liq != null ? `liq. ${pct(c.liq)}` : null, c.note].filter(Boolean).join(', ')}</span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="num text-[12px] text-muted-foreground">{pct(c.ltv)} / {pct(c.liq)}</span>
      {c.note && <span className="num text-[10px] text-muted-foreground">{c.note}</span>}
    </span>
  );
}

type SortKey = 'supplied_usd' | 'borrowed_usd' | 'utilization_percent' | 'supply_apy_percent' | 'borrow_apy_percent';

function MarketsTable({ rows, protocols }: { rows: Row[]; protocols: LendingData['protocols'] }) {
  const [protocol, setProtocol] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('supplied_usd');
  const [desc, setDesc] = useState(true);

  const list = useMemo(() => {
    const filtered = rows.filter((r) => protocol === 'all' || r.protocol_id === protocol);
    return [...filtered].sort((a, b) => {
      // Winding-down markets always sink to the bottom.
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      const d = (a[sort] ?? -1) - (b[sort] ?? -1);
      return desc ? -d : d;
    });
  }, [rows, protocol, sort, desc]);

  const options = [{ value: 'all', label: 'All' }, ...protocols.map((p) => ({ value: p.id, label: p.name.replace(' Lending', '') }))];
  const head = (key: SortKey, label: string, title?: string) => (
    <th className="text-right font-normal px-3 py-2" title={title} aria-sort={sort === key ? (desc ? 'descending' : 'ascending') : undefined}>
      <button
        type="button"
        onClick={() => (sort === key ? setDesc((d) => !d) : (setSort(key), setDesc(true)))}
        className={`inline-flex items-center gap-1 hover:text-foreground ${sort === key ? 'text-foreground' : ''}`}
      >
        {label}
        {sort === key && (desc ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
      </button>
    </th>
  );
  const capCell = (c: CapUse) =>
    c.kind === 'none' ? <span className="text-muted-foreground/50">—</span> : c.kind === 'closed' ? <span className="text-muted-foreground">Closed</span> : pct(c.value);

  return (
    <Card
      title="All markets"
      subtitle={`${rows.length} markets on ${protocols.length} protocols`}
      right={<SegmentedControl size="xs" value={protocol} options={options} onChange={setProtocol} ariaLabel="Protocol" />}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] whitespace-nowrap">
          <thead>
            <tr className="border-y border-border text-[11px] text-muted-foreground">
              <th className="text-left font-normal px-4 sm:px-5 py-2">Market</th>
              {head('supplied_usd', 'Supplied')}
              {head('borrowed_usd', 'Borrowed')}
              {head('utilization_percent', 'Used', 'Share of supplied that is borrowed')}
              {head('supply_apy_percent', 'Supply APY')}
              {head('borrow_apy_percent', 'Borrow APY')}
              <th className="text-right font-normal px-3 py-2" title="Share of the supply cap used">Supply cap</th>
              <th className="text-right font-normal px-3 py-2" title="Share of the borrow cap used">Borrow cap</th>
              <th className="text-right font-normal px-4 sm:px-5 py-2" title="Loan-to-value for new borrows / liquidation threshold. E-Mode is Aave's higher limit for related assets.">Collateral</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.map((r) => (
              <tr key={r.protocol_id + r.market + r.asset} className={r.closed ? 'opacity-55' : ''}>
                <td className="px-4 sm:px-5 py-2">
                  <span className="inline-flex items-center gap-2">
                    <ProtocolDot id={r.protocol_id} />
                    <span className="num text-[13px] font-medium text-foreground">{r.asset}</span>
                    <span className="text-[11px] text-muted-foreground">{r.protocolName}</span>
                    {r.closed && <span className="text-[10px] text-muted-foreground border border-border rounded px-1">Winding down</span>}
                  </span>
                </td>
                <td className="num text-right px-3 py-2 text-foreground">{usd(r.supplied_usd)}</td>
                <td className="num text-right px-3 py-2 text-foreground">{usd(r.borrowed_usd)}</td>
                <td className="num text-right px-3 py-2 text-muted-foreground">{pct(r.utilization_percent)}</td>
                <td className="num text-right px-3 py-2 text-foreground">{apy(r.supply_apy_percent)}</td>
                <td className="num text-right px-3 py-2 text-foreground">{borrowApy(r)}</td>
                <td className="num text-right px-3 py-2 text-foreground">{capCell(r.supplyCap)}</td>
                <td className="num text-right px-3 py-2 text-foreground">{capCell(r.borrowCap)}</td>
                <td className="text-right px-4 sm:px-5 py-2">
                  <CollateralCell r={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
