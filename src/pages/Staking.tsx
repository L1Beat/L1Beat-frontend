import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Search } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { SEO } from '../components/SEO';
import { SegmentedControl, StatStrip, UpdatedAgo } from '../components/instrument';
import type { StatItem } from '../components/instrument';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { NodeId } from '../components/NodeId';
import { shortNodeId } from '../utils/nodeId';
import { LoadingSpinner } from '../components/LoadingSpinner';
import {
  getPrimaryNetworkValidators,
  getStakingSummary,
  getStakingUnlocks,
  PRIMARY_NETWORK_SUBNET_ID,
} from '../api';
import type { PrimaryValidator, StakingSummary, StakingUnlockWeek } from '../api';

const NAVAX = 1e9;

// Categorical palette from DESIGN_SYSTEM.md, one meaning each across the page.
// Never red: on this site red means down.
const STAKE = '#3987e5'; // blue: stake, and validators' own stake
const DELEGATED = '#8b5cf6'; // violet: delegated stake
const FEE = '#d4a017'; // gold: delegation fees

/** nAVAX (decimal string or number) → AVAX. Doubles lose sub-AVAX precision, which no figure here shows. */
const toAvax = (n: string | number | undefined | null): number => (n == null ? 0 : Number(n) / NAVAX);

function compact(v: number): string {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  const a = Math.abs(v);
  if (a >= 1e9) return `${trim(v / 1e9)}B`;
  if (a >= 1e6) return `${trim(v / 1e6)}M`;
  if (a >= 1e3) return `${trim(v / 1e3)}K`;
  return Math.round(v).toLocaleString();
}

const pct = (v: number, digits = 1) => `${v.toFixed(digits)}%`;

export function Staking() {
  const [summary, setSummary] = useState<StakingSummary | null>(null);
  const [summaryState, setSummaryState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [validators, setValidators] = useState<PrimaryValidator[] | null>(null);
  const [validatorState, setValidatorState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let alive = true;
    getPrimaryNetworkValidators().then((r) => {
      if (!alive) return;
      setValidators(r);
      setValidatorState(r ? 'ready' : 'error');
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    getStakingSummary().then((s) => {
      if (!alive) return;
      setSummary(s);
      setSummaryState(s ? 'ready' : 'error');
      setLoadedAt(Date.now());
    });
    return () => {
      alive = false;
    };
  }, []);

  const stats: StatItem[] = summary
    ? [
        {
          label: 'Total staked',
          value: `${compact(toAvax(summary.total_stake))} AVAX`,
          sub: `${pct(summary.staked_supply_percent)} of total supply`,
          tooltip: `Validators' own stake plus delegations on the Primary Network. Total supply is ${compact(toAvax(summary.total_supply))} AVAX, including tokens not yet in circulation.`,
        },
        {
          label: 'Validators',
          value: summary.validator_count.toLocaleString(),
          sub: `${compact(toAvax(summary.own_stake))} AVAX own stake`,
        },
        {
          label: 'Delegations',
          value: summary.delegation_count.toLocaleString(),
          sub: `${compact(toAvax(summary.delegated_stake))} AVAX delegated`,
          tooltip: 'Active delegations. One wallet can hold several, so this is not a count of unique delegators.',
        },
        {
          label: 'Nakamoto (33%)',
          value: summary.concentration.nakamoto_33.toLocaleString(),
          sub: 'validators to control a third',
          tooltip: `The fewest validators whose combined stake, own plus delegated, passes a third of the total; ${summary.concentration.nakamoto_50} pass half. Fewer means more concentrated.`,
        },
      ]
    : ['Total staked', 'Validators', 'Delegations', 'Nakamoto (33%)'].map((label) => ({
        label,
        value: '—',
        sub: summaryState === 'error' ? 'Unavailable' : ' ',
      }));

  return (
    <div>
      <SEO
        title="Avalanche Staking"
        description="AVAX staked on the Primary Network, validators and delegations, stake concentration, delegation fees and upcoming unlocks."
        url="/staking"
      />

      {/* Hero: every validator, largest first, so the concentration is the first thing you see. */}
      <section
        className="relative border-b border-border bg-stage h-[520px] md:h-[min(calc(100vh-48px),820px)] md:min-h-[600px]"
        aria-label="Primary Network stake by validator"
      >
        <SectionErrorBoundary label="the stake distribution chart">
          <StakeSkyline validators={validators} state={validatorState} loadedAt={loadedAt} />
        </SectionErrorBoundary>
        <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(960px,calc(100%-3rem))]">
          <SectionErrorBoundary label="the staking KPIs">
            <StatStrip items={stats} floating />
          </SectionErrorBoundary>
        </div>
      </section>

      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 space-y-5">
        <div className="md:hidden">
          <StatStrip items={stats} />
        </div>

        <SectionErrorBoundary label="the unlock schedule">
          <UnlocksCard />
        </SectionErrorBoundary>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 items-stretch">
          <SectionErrorBoundary label="stake concentration">
            <ConcentrationCard summary={summary} state={summaryState} />
          </SectionErrorBoundary>
          <SectionErrorBoundary label="delegation fees">
            <FeesCard summary={summary} state={summaryState} />
          </SectionErrorBoundary>
        </div>

        <SectionErrorBoundary label="the validator table">
          <ValidatorsTable rows={validators} state={validatorState} />
        </SectionErrorBoundary>
      </div>
    </div>
  );
}

// ── Stake map (hero) ─────────────────────────────────────────────────────────

interface Tile { x: number; y: number; w: number; h: number; i: number }

/** Squarified treemap (Bruls et al.) of values sorted largest first, in a w×h box. */
function squarify(values: number[], W: number, H: number): Tile[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (!total) return [];
  const scale = (W * H) / total;
  const areas = values.map((v) => v * scale);
  const tiles: Tile[] = [];
  let x = 0, y = 0, w = W, h = H;
  let start = 0;
  const worst = (sum: number, max: number, min: number, side: number) =>
    Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  while (start < areas.length) {
    const side = Math.min(w, h);
    let end = start + 1;
    let sum = areas[start];
    let max = sum, min = sum;
    while (end < areas.length) {
      const a = areas[end];
      const nSum = sum + a;
      if (worst(nSum, Math.max(max, a), Math.min(min, a), side) > worst(sum, max, min, side)) break;
      sum = nSum; max = Math.max(max, a); min = Math.min(min, a); end++;
    }
    // Lay the row along the shorter side, then shrink the free box.
    const thick = sum / side;
    let off = 0;
    for (let k = start; k < end; k++) {
      const len = areas[k] / thick;
      tiles.push(w >= h ? { x, y: y + off, w: thick, h: len, i: k } : { x: x + off, y, w: len, h: thick, i: k });
      off += len;
    }
    if (w >= h) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    start = end;
  }
  return tiles;
}

// Tiers by running share of stake: the validators that make up a third, then half, then the rest.
const TIER_OPACITY = [1, 0.68, 0.42];

function StakeSkyline({ validators, state, loadedAt }: {
  validators: PrimaryValidator[] | null;
  state: 'loading' | 'ready' | 'error';
  loadedAt: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [state]);

  const data = useMemo(() => {
    if (!validators?.length) return null;
    const rows = validators
      .map((v) => ({ v, total: toAvax(v.total_stake ?? v.weight), own: toAvax(v.weight) }))
      .sort((a, b) => b.total - a.total);
    const sum = rows.reduce((s, r) => s + r.total, 0);
    let run = 0;
    const cum = rows.map((r) => (run += r.total) / sum);
    const reach = (share: number) => cum.findIndex((c) => c >= share) + 1;
    const third = reach(1 / 3);
    const half = reach(0.5);
    const tierOf = (i: number) => (i < third ? 0 : i < half ? 1 : 2);
    // Rounded up, so "no more than" stays true.
    const maxShare = Math.ceil((rows[0].total / sum) * 1000) / 10;
    return { rows, cum, sum, third, half, tierOf, maxShare };
  }, [validators]);

  const tiles = useMemo(
    () => (data && box && box.w > 0 && box.h > 0 ? squarify(data.rows.map((r) => r.total), box.w, box.h) : []),
    [data, box],
  );

  const n = data?.rows.length ?? 0;
  const active = data && hover != null ? data.rows[hover] : null;
  const share = (k: number) => (data ? (data.cum[k - 1] ?? 0) * 100 : 0);
  const groups = data
    ? [
        { tier: 0, count: data.third, text: 'largest validators', pctText: pct(share(data.third), 0), after: ' of stake' },
        { tier: 1, count: data.half - data.third, text: 'next largest', pctText: pct(share(data.half) - share(data.third), 0) },
        { tier: 2, count: n - data.half, text: 'everyone else', pctText: pct(100 - share(data.half), 0) },
      ]
    : [];

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 pt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[18px] leading-6 font-semibold text-foreground">Staking</h1>
          {data ? (
            <>
              <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
                No validator holds more than <span className="tabular-nums">{data.maxShare}%</span> of staked AVAX.
              </p>
              <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">
                It takes <span className="num">{data.third}</span> validators to control a third of staked AVAX, and{' '}
                <span className="num">{data.half}</span> for half.
              </p>
            </>
          ) : (
            <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
          )}
          <p className="mt-1.5 text-[12px] text-muted-foreground max-w-2xl">
            Each box is one Primary Network validator, sized by its stake, own plus delegated.
          </p>
        </div>
        <div className="sm:text-right shrink-0 sm:min-h-[64px]">
          {active && hover != null ? (
            <div>
              <div className="text-[11px] text-muted-foreground">
                #{hover + 1} <span className="num">{shortNodeId(active.v.node_id)}</span>
              </div>
              <div className="num text-[22px] leading-7 text-foreground">{compact(active.total)} AVAX</div>
              <div className="text-[11px] text-muted-foreground">
                <span style={{ color: STAKE }}>{compact(active.own)} own</span>, <span style={{ color: DELEGATED }}>{compact(active.total - active.own)} delegated</span>
                {active.v.delegation_fee_percent != null && `, ${active.v.delegation_fee_percent}% fee`}
              </div>
              <div className="text-[11px] text-muted-foreground">
                <span className="num text-foreground">{pct((active.total / (data?.sum || 1)) * 100, 2)}</span> of all stake
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:items-end">
              <UpdatedAgo at={loadedAt} />
              {/* The colour key sits where the hover readout appears, so it's read when a box is inspected. */}
              {data && (
                <span className="inline-flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: STAKE }} />Own stake</span>
                  <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: DELEGATED }} />Delegated</span>
                  <span className="hidden sm:inline">Hover a box for details</span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {data && (
        <div className="max-w-7xl 2xl:max-w-screen-2xl w-full mx-auto px-4 sm:px-6 mt-4 flex flex-wrap gap-x-5 gap-y-1.5">
          {groups.map((g) => (
            <span key={g.tier} className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
              <span className="w-3 h-3 rounded-[2px]" style={{ background: STAKE, opacity: TIER_OPACITY[g.tier] }} />
              <span>
                <span className="num text-foreground">{g.count}</span> {g.text}: <span className="num text-foreground">{g.pctText}</span>{'after' in g && g.after}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="relative flex-1 min-h-0 mx-4 sm:mx-6 lg:mx-10 mt-3 mb-4 md:mb-[128px]">
        {state === 'error' ? (
          <div className="h-full flex items-center justify-center text-[12px] text-muted-foreground">
            The validator list couldn't be loaded. Try again in a minute.
          </div>
        ) : !data ? (
          <div className="h-full rounded bg-muted/50 animate-pulse" />
        ) : (
          <div ref={boxRef} className="absolute inset-0" onMouseLeave={() => setHover(null)}>
            {tiles.map((t) => {
              const r = data.rows[t.i];
              const tier = data.tierOf(t.i);
              const on = hover === t.i;
              const big = t.w > 64 && t.h > 34;
              return (
                <Link
                  key={r.v.validation_id}
                  to={`/validator/${encodeURIComponent(r.v.node_id)}?subnet=${PRIMARY_NETWORK_SUBNET_ID}`}
                  aria-label={`Validator ${r.v.node_id}, ${compact(r.total)} AVAX`}
                  onMouseEnter={() => setHover(t.i)}
                  onFocus={() => setHover(t.i)}
                  className="absolute block p-px"
                  style={{ left: t.x, top: t.y, width: t.w, height: t.h }}
                >
                  <span
                    className={`relative flex flex-col w-full h-full rounded-[2px] overflow-hidden ${on ? 'ring-2 ring-foreground' : ''}`}
                  >
                    {/* Delegated share on top, own stake below; only the fills fade by tier. */}
                    <span style={{ background: DELEGATED, opacity: on ? 1 : TIER_OPACITY[tier], flexBasis: `${((r.total - r.own) / (r.total || 1)) * 100}%` }} className="shrink-0" />
                    <span style={{ background: STAKE, opacity: on ? 1 : TIER_OPACITY[tier] }} className="flex-1" />
                    {big && (
                      <span className={`num absolute left-0 top-0 px-1.5 pt-1 text-[11px] leading-4 ${tier === 0 || on ? 'text-white' : 'text-foreground/80'}`}>
                        {compact(r.total)}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function Card({ title, subtitle, right, children, className = '' }: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-border bg-card p-4 sm:p-5 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-4">
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

function CardMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center h-[160px] text-[12px] text-muted-foreground text-center px-6">{children}</div>;
}

// ── Unlocks ──────────────────────────────────────────────────────────────────

// Phones get a narrower canvas so the labels stay readable when it scales down.
const UNLOCK_SIZE = { wide: { w: 820, h: 220 }, narrow: { w: 400, h: 220 } };
const UNLOCK_M = { top: 10, right: 8, bottom: 24, left: 48 };
const WEEK_OPTIONS = [
  { value: '12', label: '12w' },
  { value: '26', label: '26w' },
  { value: '52', label: '52w' },
] as const;

function UnlocksCard() {
  const [weeks, setWeeks] = useState<'12' | '26' | '52'>('12');
  const [rows, setRows] = useState<StakingUnlockWeek[] | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const narrow = useMediaQuery('(max-width: 639px)');
  const { w: UNLOCK_W, h: UNLOCK_H } = narrow ? UNLOCK_SIZE.narrow : UNLOCK_SIZE.wide;

  useEffect(() => {
    let alive = true;
    setState('loading');
    getStakingUnlocks(Number(weeks)).then((r) => {
      if (!alive) return;
      setRows(r);
      setState(r && r.length ? 'ready' : 'error');
    });
    return () => {
      alive = false;
    };
  }, [weeks]);

  const bars = useMemo(
    () =>
      (rows ?? []).map((r) => ({
        week: new Date(r.week_start),
        own: toAvax(r.validator_stake),
        delegated: toAvax(r.delegated_stake),
        validators: r.validator_count,
        delegations: r.delegation_count,
      })),
    [rows],
  );

  const geom = useMemo(() => {
    if (!bars.length) return null;
    const peak = Math.max(...bars.map((b) => b.own + b.delegated), 1);
    // About four steps of 1, 2, 2.5 or 5 times a power of ten, topped just above the peak.
    const raw = peak / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const tick = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
    const maxY = Math.ceil(peak / tick) * tick;
    const ticks = Array.from({ length: Math.round(maxY / tick) + 1 }, (_, i) => i * tick);
    const iw = UNLOCK_W - UNLOCK_M.left - UNLOCK_M.right;
    const ih = UNLOCK_H - UNLOCK_M.top - UNLOCK_M.bottom;
    const slot = iw / bars.length;
    const barW = Math.max(2, slot * 0.72);
    const x = (i: number) => UNLOCK_M.left + slot * i + (slot - barW) / 2;
    const y = (v: number) => UNLOCK_M.top + ih - (v / maxY) * ih;
    const labelEvery = Math.ceil(bars.length / (UNLOCK_W < 600 ? 4 : 8));
    return { x, y, barW, slot, floor: UNLOCK_M.top + ih, ticks, labelEvery };
  }, [bars, UNLOCK_W, UNLOCK_H]);

  const total = bars.reduce((s, b) => s + b.own + b.delegated, 0);
  const active = hover != null ? bars[hover] : null;
  const weekLabel = (d: Date, i: number) => (i === 0 ? 'This week' : format(d, 'MMM d'));

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!geom || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * UNLOCK_W;
    const i = Math.floor((vx - UNLOCK_M.left) / geom.slot);
    setHover(i >= 0 && i < bars.length ? i : null);
  };

  return (
    <Card
      title="Unlocks"
      subtitle="AVAX whose staking period ends each week, validators' own stake and delegations"
      right={
        <SegmentedControl
          size="xs"
          value={weeks}
          options={WEEK_OPTIONS}
          onChange={(v) => setWeeks(v)}
          ariaLabel="Unlock window"
        />
      }
    >
      {state === 'loading' && !geom ? (
        <div className="h-[220px] rounded bg-muted animate-pulse" />
      ) : state === 'error' || !geom ? (
        <CardMessage>The unlock schedule couldn't be loaded. Try again in a minute.</CardMessage>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-2">
            <div>
              <div className="num text-[22px] leading-7 font-medium text-foreground">
                {compact(active ? active.own + active.delegated : total)} AVAX
              </div>
              <div className="text-[11px] text-muted-foreground">
                {active
                  ? `${hover === 0 ? 'This week' : `Week of ${format(active.week, 'MMM d')}`}: ${active.validators} validators, ${active.delegations.toLocaleString()} delegations`
                  : `over the next ${bars.length} weeks`}
              </div>
            </div>
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STAKE }} />
                Own stake{active ? ` ${compact(active.own)}` : ''}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: DELEGATED }} />
                Delegated{active ? ` ${compact(active.delegated)}` : ''}
              </span>
            </div>
          </div>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${UNLOCK_W} ${UNLOCK_H}`}
            className={`w-full h-auto block ${state === 'loading' ? 'opacity-50' : ''}`}
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={`AVAX unlocking per week over the next ${bars.length} weeks`}
          >
            {geom.ticks.map((t) => (
              <g key={t}>
                <line x1={UNLOCK_M.left} x2={UNLOCK_W - UNLOCK_M.right} y1={geom.y(t)} y2={geom.y(t)} stroke="currentColor" strokeOpacity={0.08} />
                <text x={UNLOCK_M.left - 8} y={geom.y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
                  {compact(t)}
                </text>
              </g>
            ))}
            {bars.map((b, i) => {
              const dim = hover != null && hover !== i;
              const yOwn = geom.y(b.own);
              const yTop = geom.y(b.own + b.delegated);
              return (
                <g key={b.week.toISOString()} opacity={dim ? 0.45 : 1}>
                  <rect x={geom.x(i)} y={yOwn} width={geom.barW} height={Math.max(0, geom.floor - yOwn)} fill={STAKE} />
                  <rect x={geom.x(i)} y={yTop} width={geom.barW} height={Math.max(0, yOwn - yTop)} rx={1} fill={DELEGATED} />
                  {i % geom.labelEvery === 0 && (
                    <text x={geom.x(i) + geom.barW / 2} y={UNLOCK_H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                      {weekLabel(b.week, i)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Validators set to renew automatically are counted at the end of their current period, so later weeks can overstate what actually unlocks.
          </p>
        </>
      )}
    </Card>
  );
}

// ── Concentration ────────────────────────────────────────────────────────────

function ShareBar({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span className="text-foreground">{label}</span>
        <span className="num text-foreground">
          {pct(value)}
          {detail && <span className="text-muted-foreground"> {detail}</span>}
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-sm bg-muted overflow-hidden">
        <div className="h-full rounded-sm" style={{ width: `${Math.min(100, value)}%`, background: STAKE }} />
      </div>
    </div>
  );
}

function ConcentrationCard({ summary, state }: { summary: StakingSummary | null; state: 'loading' | 'ready' | 'error' }) {
  const c = summary?.concentration;
  const total = summary ? toAvax(summary.total_stake) : 0;
  return (
    <Card title="Stake concentration" subtitle="Share of total stake, own plus delegated, held by the largest validators" className="h-full">
      {!c ? (
        state === 'loading' ? <div className="h-[160px] rounded bg-muted animate-pulse" /> : <CardMessage>Concentration data couldn't be loaded.</CardMessage>
      ) : (
        <div className="space-y-4">
          <ShareBar label="Top 10 validators" value={c.top10_percent} detail={`${compact((total * c.top10_percent) / 100)} AVAX`} />
          <ShareBar label="Top 50" value={c.top50_percent} detail={`${compact((total * c.top50_percent) / 100)} AVAX`} />
          <ShareBar label="Top 100" value={c.top100_percent} detail={`${compact((total * c.top100_percent) / 100)} AVAX`} />
          <dl className="grid grid-cols-2 gap-px rounded border border-border bg-border overflow-hidden">
            <div className="bg-card px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">To control a third</dt>
              <dd className="num text-[18px] text-foreground">{c.nakamoto_33}</dd>
            </div>
            <div className="bg-card px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">To control half</dt>
              <dd className="num text-[18px] text-foreground">{c.nakamoto_50}</dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}

// ── Delegation fees ──────────────────────────────────────────────────────────

function FeesCard({ summary, state }: { summary: StakingSummary | null; state: 'loading' | 'ready' | 'error' }) {
  const fee = summary?.delegation_fee;
  const maxCount = fee ? Math.max(...fee.histogram.map((b) => b.validator_count), 1) : 1;
  const total = summary ? toAvax(summary.total_stake) : 0;
  return (
    <Card
      title="Delegation fees"
      subtitle="The share of delegators' rewards a validator keeps"
      right={
        fee && (
          <div className="text-right">
            <div className="num text-[18px] leading-6 text-foreground">{pct(fee.median_percent)}</div>
            <div className="text-[11px] text-muted-foreground">median</div>
          </div>
        )
      }
      className="h-full"
    >
      {!fee ? (
        state === 'loading' ? <div className="h-[160px] rounded bg-muted animate-pulse" /> : <CardMessage>Fee data couldn't be loaded.</CardMessage>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="text-left font-medium pb-2 w-16">Fee</th>
              <th className="text-left font-medium pb-2">Validators</th>
              <th className="text-right font-medium pb-2 w-24">Stake share</th>
            </tr>
          </thead>
          <tbody>
            {fee.histogram.map((b) => {
              const share = total > 0 ? (toAvax(b.total_stake) / total) * 100 : 0;
              return (
                <tr key={b.label}>
                  <td className="num py-1.5 text-foreground">{b.label}</td>
                  <td className="py-1.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-sm bg-muted overflow-hidden">
                        <div className="h-full rounded-sm" style={{ width: `${(b.validator_count / maxCount) * 100}%`, background: FEE }} />
                      </div>
                      <span className="num w-8 text-right text-foreground">{b.validator_count}</span>
                    </div>
                  </td>
                  <td className="num py-1.5 text-right text-muted-foreground">{pct(share)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ── Validators ───────────────────────────────────────────────────────────────

type VSortKey = 'total' | 'own' | 'delegated' | 'delegators' | 'fee' | 'uptime' | 'end';
type SortDir = 'asc' | 'desc';
const VALIDATOR_PAGE = 50;

function SortTh({ label, k, sort, onSort, align = 'right', className = '' }: {
  label: string;
  k: string;
  sort: { key: string; dir: SortDir };
  onSort: (k: string) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`h-9 px-3 text-[11px] font-medium ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        {label}
        <span aria-hidden className={`text-[9px] ${active ? '' : 'opacity-0'}`}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  );
}

/** Own (blue) and delegated (violet) stake, scaled to the largest validator. */
function StakeSplit({ own, total, max }: { own: number; total: number; max: number }) {
  return (
    <div className="flex h-1.5 w-full rounded-sm bg-muted overflow-hidden" title={`${compact(toAvax(own))} own, ${compact(toAvax(total - own))} delegated`}>
      <div style={{ width: `${(own / max) * 100}%`, background: STAKE }} />
      <div style={{ width: `${((total - own) / max) * 100}%`, background: DELEGATED }} />
    </div>
  );
}

function ValidatorsTable({ rows, state }: { rows: PrimaryValidator[] | null; state: 'loading' | 'ready' | 'error' }) {
  const [sort, setSort] = useState<{ key: VSortKey; dir: SortDir }>({ key: 'total', dir: 'desc' });
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const value = (v: PrimaryValidator, k: VSortKey): number => {
    switch (k) {
      case 'total': return v.total_stake ?? v.weight;
      case 'own': return v.weight;
      case 'delegated': return v.total_delegated ?? 0;
      case 'delegators': return v.delegator_count ?? 0;
      case 'fee': return v.delegation_fee_percent ?? 0;
      case 'uptime': return v.uptime_percentage ?? 0;
      case 'end': return v.end_time ? Date.parse(v.end_time) : Infinity;
    }
  };

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (rows ?? []).filter((v) => !q || v.node_id.toLowerCase().includes(q));
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => (value(a, sort.key) - value(b, sort.key)) * dir);
  }, [rows, sort, query]);

  const onSort = (k: string) =>
    setSort((s) => (s.key === k ? { key: s.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k as VSortKey, dir: k === 'end' ? 'asc' : 'desc' }));

  const visible = showAll || query ? sorted : sorted.slice(0, VALIDATOR_PAGE);
  const maxStake = useMemo(() => Math.max(1, ...(rows ?? []).map((v) => v.total_stake ?? v.weight)), [rows]);

  return (
    <section>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 pb-2 border-b border-border">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Primary Network validators</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {rows ? `${rows.length} active, ranked by total stake` : 'Active validators, ranked by total stake'}
            <span className="hidden lg:inline">
              {'. '}Bars split <span style={{ color: STAKE }}>own stake</span> and <span style={{ color: DELEGATED }}>delegated</span>.
            </span>
          </p>
        </div>
        <div className="relative sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search node ID"
            placeholder="Search node ID"
            className="w-full h-8 pl-8 pr-2 rounded border border-border bg-background text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
          />
        </div>
      </div>

      {state === 'loading' ? (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="md" />
        </div>
      ) : state === 'error' ? (
        <div className="px-6 py-12 text-center text-[12px] text-muted-foreground">The validator list couldn't be loaded. Try again in a minute.</div>
      ) : sorted.length === 0 ? (
        <div className="px-6 py-12 text-center text-[12px] text-muted-foreground">No validator matches “{query}”.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="h-9 px-3 text-left text-[11px] font-medium text-muted-foreground w-10">#</th>
                  <th className="h-9 px-3 text-left text-[11px] font-medium text-muted-foreground">Node</th>
                  <SortTh label="Total stake" k="total" sort={sort} onSort={onSort} />
                  <th className="h-9 px-3 text-left text-[11px] font-medium text-muted-foreground hidden lg:table-cell w-32">
                    <span className="sr-only">Own and delegated split</span>
                  </th>
                  <SortTh label="Own" k="own" sort={sort} onSort={onSort} className="hidden md:table-cell" />
                  <SortTh label="Delegated" k="delegated" sort={sort} onSort={onSort} className="hidden md:table-cell" />
                  <SortTh label="Delegators" k="delegators" sort={sort} onSort={onSort} className="hidden lg:table-cell" />
                  <SortTh label="Fee" k="fee" sort={sort} onSort={onSort} />
                  <SortTh label="Uptime" k="uptime" sort={sort} onSort={onSort} className="hidden sm:table-cell" />
                  <SortTh label="Ends" k="end" sort={sort} onSort={onSort} className="hidden sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {visible.map((v, i) => (
                  <tr key={v.validation_id} className="border-b border-border/60 hover:bg-accent/40">
                    <td className="num px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2">
                      <NodeId id={v.node_id} to={`/validator/${encodeURIComponent(v.node_id)}?subnet=${PRIMARY_NETWORK_SUBNET_ID}`} />
                    </td>
                    <td className="num px-3 py-2 text-right text-foreground">{compact(toAvax(v.total_stake ?? v.weight))}</td>
                    <td className="px-3 py-2 hidden lg:table-cell">
                      <StakeSplit own={v.weight} total={v.total_stake ?? v.weight} max={maxStake} />
                    </td>
                    <td className="num px-3 py-2 text-right text-muted-foreground hidden md:table-cell">{compact(toAvax(v.weight))}</td>
                    <td className="num px-3 py-2 text-right text-muted-foreground hidden md:table-cell">
                      {v.total_delegated ? compact(toAvax(v.total_delegated)) : '—'}
                    </td>
                    <td className="num px-3 py-2 text-right text-muted-foreground hidden lg:table-cell">
                      {v.delegator_count ? v.delegator_count.toLocaleString() : '—'}
                    </td>
                    <td className="num px-3 py-2 text-right text-foreground">
                      {v.delegation_fee_percent != null ? pct(v.delegation_fee_percent, v.delegation_fee_percent % 1 ? 1 : 0) : '—'}
                    </td>
                    <td className="num px-3 py-2 text-right text-muted-foreground hidden sm:table-cell">
                      {v.uptime_percentage == null ? (
                        '—'
                      ) : v.uptime_percentage < 80 ? (
                        <span className="text-down" title="Below 80% uptime, the minimum for staking rewards">{pct(v.uptime_percentage)}</span>
                      ) : (
                        pct(v.uptime_percentage)
                      )}
                    </td>
                    <td className="num px-3 py-2 text-right text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                      {v.end_time ? format(new Date(v.end_time), 'MMM d, yyyy') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between gap-2 py-2">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {visible.length} of {sorted.length} validators. Stake in AVAX.
            </span>
            {!query && sorted.length > VALIDATOR_PAGE && (
              <button
                type="button"
                onClick={() => setShowAll((s) => !s)}
                className="h-7 px-2.5 rounded border border-border text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
              >
                {showAll ? `Show top ${VALIDATOR_PAGE}` : `Show all ${sorted.length}`}
              </button>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
