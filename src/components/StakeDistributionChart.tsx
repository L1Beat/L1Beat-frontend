import { useEffect, useMemo, useRef, useState } from 'react';
import { Validator } from '../types';
import { unitsToNumber } from '../utils/formatUnits';

// Kept for callers that still color validators by index.
export const getValidatorColor = (index: number, isDark: boolean, alpha = 1) => {
  const hue = (index * 137.508) % 360;
  const saturation = isDark ? '45%' : '40%';
  const lightness = isDark ? '70%' : '75%';
  return `hsla(${hue}, ${saturation}, ${lightness}, ${alpha})`;
};

interface StakeDistributionChartProps {
  validators: Validator[];
  mode?: 'tokens' | 'weight';
  tokenSymbol?: string;
  tokenDecimals?: number;
  onValidatorClick?: (validator: Validator) => void;
}

interface Tile { x: number; y: number; w: number; h: number; i: number }

/** Squarified treemap (Bruls et al.) of values sorted largest first, in a w×h box. Same layout as the Staking page's map. */
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

const BLUE = '#3987e5';
// Tiers by running share: the validators that make up a third, then half, then the rest.
const TIER_OPACITY = [1, 0.68, 0.42];

const short = (a: string) => (a.length > 16 ? `${a.slice(0, 11)}…${a.slice(-4)}` : a);
const pct = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));
const amount = (v: number) => {
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (v >= 1e9) return `${trim(v / 1e9)}B`;
  if (v >= 1e6) return `${trim(v / 1e6)}M`;
  if (v >= 1e3) return `${trim(v / 1e3)}K`;
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

/**
 * Each active validator as a box sized by its stake or weight. Equal weights read
 * as an even grid; otherwise the boxes are shaded by the third and half of stake.
 */
export function StakeDistributionChart({ validators, mode, tokenSymbol, tokenDecimals, onValidatorClick }: StakeDistributionChartProps) {
  const isWeightMode = mode === 'weight' ? true : mode === 'tokens' ? false : validators.some((v) => v.stakeUnit === 'weight');
  const decimals = typeof tokenDecimals === 'number' && Number.isFinite(tokenDecimals) ? tokenDecimals : 18;
  const unit = isWeightMode ? 'weight' : tokenSymbol || 'tokens';

  const rows = useMemo(() => {
    // PoS chains show real staked tokens; proportions come from weight either way.
    // A node can hold several validations (common on PoA L1s); they're one validator here,
    // matching the decentralization counts.
    const byNode = new Map<string, { v: Validator; w: number; tokens: number | null; entries: number }>();
    for (const v of validators) {
      // On the Primary Network delegations count toward a validator's weight, so
      // they're part of its box (and of the third and half counts).
      const delegated = !isWeightMode && v.delegated ? v.delegated / 10 ** decimals : 0;
      const w = unitsToNumber(v.weight, isWeightMode ? 0 : decimals) + delegated;
      if (!Number.isFinite(w) || w <= 0) continue;
      const tokens = !isWeightMode && v.stakedAmount != null ? (Number(v.stakedAmount) || 0) + delegated : null;
      const e = byNode.get(v.address);
      if (e) {
        e.w += w;
        e.tokens = e.tokens != null && tokens != null ? e.tokens + tokens : e.tokens ?? tokens;
        e.entries += 1;
      } else byNode.set(v.address, { v, w, tokens, entries: 1 });
    }
    const list = [...byNode.values()].sort((a, b) => b.w - a.w);
    const total = list.reduce((s, r) => s + r.w, 0);
    let run = 0;
    return list.map((r) => {
      const before = run;
      run += r.w;
      return { ...r, share: total > 0 ? (r.w / total) * 100 : 0, tier: before < total / 3 ? 0 : before < total / 2 ? 1 : 2 };
    });
  }, [validators, isWeightMode, decimals]);

  const equal = rows.length > 1 && rows[0].w === rows[rows.length - 1].w;
  const hasDelegations = validators.some((v) => (v.delegated ?? 0) > 0);
  const tierCount = [0, 1, 2].map((t) => rows.filter((r) => r.tier === t).length);
  const totalTokens = rows.reduce((s, r) => s + (r.tokens ?? r.w), 0);

  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const tiles = useMemo(() => (box && box.w > 0 && box.h > 0 ? squarify(rows.map((r) => r.w), box.w, box.h) : []), [rows, box]);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover != null ? rows[hover] : null;

  const overOne = rows.filter((r) => r.share >= 1).length;

  return (
    <section className="bg-card rounded-md border border-border overflow-hidden">
      <header className="px-4 sm:px-5 pt-4 pb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-foreground">{isWeightMode ? 'Weight distribution' : 'Stake distribution'}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Each box is one active validator node, sized by its {isWeightMode ? 'weight' : hasDelegations ? 'stake, own plus delegated' : 'stake'}. Click one for its details.
          </p>
        </div>
        <span className="text-[11px] text-muted-foreground">
          <span className="num text-foreground">{amount(totalTokens)}</span> {unit} across <span className="num text-foreground">{rows.length}</span> validators
        </span>
      </header>

      <div className="px-4 sm:px-5 pb-3">
        <p className="text-[13px] text-foreground min-h-5">
          {shown ? (
            <>
              <span className="num">{short(shown.v.address)}</span>
              <span className="text-muted-foreground">
                {' '}holds <span className="num text-foreground">{shown.tokens != null ? amount(shown.tokens) : amount(shown.w)}</span> {unit},{' '}
                <span className="num text-foreground">{pct(shown.share)}%</span> of the total
                {shown.entries > 1 && <>, across {shown.entries} validations</>}
              </span>
            </>
          ) : equal ? (
            <>
              All <span className="num">{rows.length}</span> validators hold the same {isWeightMode ? 'weight' : 'stake'},{' '}
              <span className="num">{pct(rows[0].share)}%</span> each, so no single validator outweighs another.
            </>
          ) : rows.length > 1 ? (
            <>
              The largest validator holds <span className="num">{pct(rows[0].share)}%</span>
              {overOne < rows.length ? (
                <>, and <span className="num">{rows.length - overOne}</span> of the <span className="num">{rows.length}</span> hold less than 1% each.</>
              ) : (
                '.'
              )}
            </>
          ) : rows.length === 1 ? (
            'One active validator holds all of it.'
          ) : null}
        </p>
      </div>

      <div ref={boxRef} className="relative mx-4 sm:mx-5 h-[220px] sm:h-[280px]" onMouseLeave={() => setHover(null)}>
        {tiles.map((t) => {
          const r = rows[t.i];
          const label = t.w > 46 && t.h > 22;
          const Tile = onValidatorClick ? 'button' : 'div';
          return (
            // A button when boxes open the validator, so they're reachable and usable by keyboard.
            <Tile
              key={r.v.address}
              {...(onValidatorClick ? { type: 'button' as const, 'aria-label': `Validator ${r.v.address}, ${pct(r.share)}% of the weight` } : {})}
              className={`absolute block text-left ${onValidatorClick ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded-[2px]' : ''}`}
              style={{ left: t.x, top: t.y, width: t.w, height: t.h, padding: t.w > 3 && t.h > 3 ? 1 : 0 }}
              onMouseEnter={() => setHover(t.i)}
              onFocus={() => setHover(t.i)}
              onBlur={() => setHover(null)}
              onClick={() => onValidatorClick?.(r.v)}
              title={`${r.v.address}: ${pct(r.share)}%`}
            >
              <div
                className="w-full h-full rounded-[2px] transition-opacity"
                style={{
                  background: BLUE,
                  opacity: (equal ? 0.8 : TIER_OPACITY[r.tier]) * (hover == null || hover === t.i ? 1 : 0.55),
                  outline: hover === t.i ? '1px solid var(--foreground)' : undefined,
                }}
              />
              {label && (
                <span className={`num absolute left-1.5 top-1 text-[10px] leading-3 pointer-events-none ${!equal && r.tier > 0 ? 'text-foreground/80' : 'text-white/90'}`}>{pct(r.share)}%</span>
              )}
            </Tile>
          );
        })}
      </div>

      <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {equal ? (
          <span>Every box is the same size: the {isWeightMode ? 'weight' : 'stake'} is spread evenly.</span>
        ) : (
          [
            [0, `${tierCount[0]} hold a third`],
            [1, `${tierCount[1]} more reach half`],
            [2, `${tierCount[2]} hold the rest`],
          ].filter(([t]) => tierCount[t as number] > 0).map(([t, text]) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: BLUE, opacity: TIER_OPACITY[t as number] }} />
              {text}
            </span>
          ))
        )}
      </div>
    </section>
  );
}
