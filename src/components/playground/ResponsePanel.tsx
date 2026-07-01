import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal, AlertCircle, Copy, ChevronRight, ChevronDown, Link } from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { Skeleton } from '../branding/ui/skeleton';
import { EndpointDef } from './endpointCatalog';
import { smoothLinePath } from '../../utils/chartConfig';
import { fieldHint } from './fieldHints';
import { ChartWatermark } from '../ChartWatermark';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../branding/ui/tooltip';

// A response key with a known meaning → dotted underline + styled tooltip.
function KeyLabel({ name }: { name: string }) {
  const hint = fieldHint(name);
  const span = (
    <span
      className={
        'text-[#60a5fa]' +
        (hint ? ' cursor-help underline decoration-dotted underline-offset-2 decoration-muted-foreground/60' : '')
      }
    >
      {JSON.stringify(name)}
    </span>
  );
  if (!hint) return span;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{span}</TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-[260px] bg-popover border border-border text-foreground text-[11px] normal-case font-normal tracking-normal leading-relaxed px-3 py-2 shadow-xl [&>span]:hidden"
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

// Fields we have a detail page for → make their values clickable in responses.
// Only validators today (/validator/:id resolves a node_id or validation_id
// directly). Chains resolve by app slug, not the API id, so they're not linked.
const VALIDATOR_KEYS = new Set(['node_id', 'validation_id']);
function validatorLink(key: string | undefined, value: unknown): string | null {
  if (!key || !VALIDATOR_KEYS.has(key) || typeof value !== 'string' || !value) return null;
  return `/validator/${encodeURIComponent(value)}`;
}

// ─── Chart view ────────────────────────────────────────────────────────────
// Detects a time series in the response and renders a compact line chart.
// Handles the three timeseries shapes the API returns.

interface ChartSeries {
  label: string;
  points: { t: number; y: number }[];
}

function extractSeries(resp: unknown): ChartSeries | null {
  if (!resp || typeof resp !== 'object') return null;
  const d = (resp as Record<string, unknown>).data;
  if (!d) return null;
  const toPoints = (arr: unknown[], key: string) =>
    (arr as Record<string, unknown>[])
      .map((p) => ({ t: Date.parse(String(p.period)), y: Number(p[key]) }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y))
      .sort((a, b) => a.t - b.t);

  // metrics timeseries: data.data = [{ period, value }]
  if (!Array.isArray(d)) {
    const obj = d as Record<string, unknown>;
    if (Array.isArray(obj.data) && obj.data.length && 'period' in (obj.data[0] as object)) {
      return { label: String(obj.metric_name ?? 'value'), points: toPoints(obj.data, 'value') };
    }
    // fee burn: data.series = [{ period, total_burned, ... }]
    if (Array.isArray(obj.series) && obj.series.length && 'period' in (obj.series[0] as object)) {
      return { label: 'total burned', points: toPoints(obj.series, 'total_burned') };
    }
  }
  // stablecoin timeseries: data = [{ token, metric_name, data: [{period, value}] }]
  if (Array.isArray(d) && d.length) {
    const first = d[0] as Record<string, unknown>;
    if (Array.isArray(first.data) && first.data.length && 'period' in (first.data[0] as object)) {
      const label = String(first.token ?? first.metric_name ?? 'series') + (d.length > 1 ? ` (1 of ${d.length})` : '');
      return { label, points: toPoints(first.data, 'value') };
    }
  }
  return null;
}

function abbrev(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Number(v.toFixed(2)));
}

function ChartView({ series }: { series: ChartSeries }) {
  const pts = series.points;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (pts.length < 2) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Not enough data points to chart.
      </div>
    );
  }
  const W = 760, H = 260, M = { top: 16, right: 20, bottom: 28, left: 64 };
  const iw = W - M.left - M.right, ih = H - M.top - M.bottom;
  const xs = pts.map((p) => p.t), ys = pts.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const sx = (t: number) => M.left + ((t - minX) / (maxX - minX || 1)) * iw;
  const sy = (y: number) => M.top + ih - ((y - minY) / (maxY - minY || 1)) * ih;
  const line = smoothLinePath(pts.map((p) => ({ x: sx(p.t), y: sy(p.y) })));
  const floor = M.top + ih;
  const area = `${line} L${sx(maxX).toFixed(1)},${floor} L${sx(minX).toFixed(1)},${floor} Z`;
  const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 10);
  const ticks = [maxY, (minY + maxY) / 2, minY];

  // Map the pointer to the nearest data point (in viewBox space so it works
  // regardless of the SVG's rendered size).
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(sx(pts[i].t) - vbX);
      if (d < bestD) { bestD = d; best = i; }
    }
    setHover(best);
  };

  const hp = hover !== null ? pts[hover] : null;
  const hoverPct = hp ? (sx(hp.t) / W) * 100 : 0;
  // Flip the tooltip toward the interior near the edges so it doesn't clip.
  const tipTransform =
    hoverPct < 12 ? 'translate(0, -100%)'
      : hoverPct > 88 ? 'translate(-100%, -100%)'
      : 'translate(-50%, -100%)';

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="text-xs text-muted-foreground mb-3">{series.label} · {pts.length} points</div>
      <div className="relative w-full">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block"
          role="img"
          aria-label={`${series.label} over time`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="pg-series-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.28} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map((tick, i) => (
            <g key={i}>
              <line x1={M.left} x2={W - M.right} y1={sy(tick)} y2={sy(tick)} stroke="currentColor" strokeOpacity={0.08} />
              <text x={M.left - 8} y={sy(tick)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground" fontSize={10}>
                {abbrev(tick)}
              </text>
            </g>
          ))}
          <path d={area} fill="url(#pg-series-fill)" />
          <path d={line} fill="none" stroke="#ef4444" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <text x={M.left} y={H - 8} textAnchor="start" className="fill-muted-foreground" fontSize={10}>{fmtDate(minX)}</text>
          <text x={W - M.right} y={H - 8} textAnchor="end" className="fill-muted-foreground" fontSize={10}>{fmtDate(maxX)}</text>
          {hp && (
            <g>
              <line x1={sx(hp.t)} x2={sx(hp.t)} y1={M.top} y2={floor} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="3 3" />
              <circle cx={sx(hp.t)} cy={sy(hp.y)} r={3.5} fill="#ef4444" stroke="var(--background)" strokeWidth={1.5} />
            </g>
          )}
        </svg>
        <ChartWatermark />
        {hp && (
          <div
            className="pointer-events-none absolute z-10 px-2 py-1 rounded-md bg-card border border-border shadow-md text-[11px] whitespace-nowrap"
            style={{
              left: `${hoverPct}%`,
              top: `${(sy(hp.y) / H) * 100}%`,
              transform: tipTransform,
              marginTop: -8,
            }}
          >
            <div className="font-mono font-semibold text-foreground">{hp.y.toLocaleString()}</div>
            <div className="text-muted-foreground">{fmtDate(hp.t)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── StatusBadge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: number }) {
  const color =
    status >= 500
      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
      : status >= 400
      ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
      : status >= 300
      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
      : 'bg-green-500/15 text-green-600 dark:text-green-400';
  const label =
    status >= 400
      ? `${status} Error`
      : status >= 300
      ? `${status} Redirect`
      : `${status} OK`;
  return (
    <span
      className={`text-xs font-mono font-medium px-2 py-0.5 rounded-full ${color}`}
    >
      {label}
    </span>
  );
}

// ─── Rate Limit Card ────────────────────────────────────────────────────────

function RateLimitCard({
  retryAfter,
  autoRetry,
  onRetry,
}: {
  retryAfter: number;
  autoRetry: boolean;
  onRetry: () => void;
}) {
  const [seconds, setSeconds] = useState(retryAfter);
  // When auto-retry is exhausted we start paused, showing a manual retry button.
  const [paused, setPaused] = useState(!autoRetry);
  const firedRef = useRef(false);
  const onRetryRef = useRef(onRetry);
  useEffect(() => { onRetryRef.current = onRetry; });

  useEffect(() => {
    if (paused) return;
    if (seconds <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onRetryRef.current();
      }
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, paused]);

  return (
    <div className="m-6 p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
      <div className="font-medium text-orange-700 dark:text-orange-400 mb-2">
        Rate Limited
      </div>
      {paused ? (
        <>
          <p className="text-sm text-foreground mb-3">
            {autoRetry
              ? 'Auto-retry cancelled.'
              : 'Auto-retry paused after several attempts.'}{' '}
            You are being rate limited (60 req/min, burst 10). Wait a moment, then retry.
          </p>
          <button
            onClick={() => onRetryRef.current()}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#ef4444] hover:bg-[#dc2626] text-white font-medium transition-colors"
          >
            Retry now
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-foreground mb-3">
            Retrying in{' '}
            <span className="font-mono font-bold">{seconds}s</span>...
          </p>
          <button
            onClick={() => setPaused(true)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel auto-retry
          </button>
        </>
      )}
    </div>
  );
}

// ─── JSON Viewer ─────────────────────────────────────────────────────────────

// Max array items rendered per node in the tree viewer (guards against freezing
// on very large / accumulated responses; full data stays available via Copy JSON).
const ARRAY_RENDER_CAP = 100;

interface ExpandSignals {
  expandSig: number;
  collapseSig: number;
  generation: number;
}
const ExpandContext = React.createContext<ExpandSignals>({ expandSig: 0, collapseSig: 0, generation: 0 });

interface JsonNodeProps {
  value: unknown;
  depth: number;
  objKey?: string;
}

function JsonNode({ value, depth, objKey }: JsonNodeProps) {
  const { expandSig, collapseSig, generation } = React.useContext(ExpandContext);
  const isArray = Array.isArray(value);
  const isObject =
    value !== null && typeof value === 'object' && !isArray;
  const isComplex = isArray || isObject;

  const defaultOpen = isComplex;
  const [open, setOpen] = useState(defaultOpen);

  // Reset to default when a new response arrives
  const prevGenRef = useRef(generation);
  useEffect(() => {
    if (prevGenRef.current !== generation) {
      prevGenRef.current = generation;
      setOpen(defaultOpen);
    }
  }, [generation, defaultOpen]);

  // Expand all signal
  const prevExpandSig = useRef(expandSig);
  useEffect(() => {
    if (prevExpandSig.current !== expandSig) {
      prevExpandSig.current = expandSig;
      if (isComplex) setOpen(true);
    }
  }, [expandSig, isComplex]);

  // Collapse all signal
  const prevCollapseSig = useRef(collapseSig);
  useEffect(() => {
    if (prevCollapseSig.current !== collapseSig) {
      prevCollapseSig.current = collapseSig;
      if (isComplex) setOpen(false);
    }
  }, [collapseSig, isComplex]);

  const indent = { paddingLeft: `${depth * 16}px` };

  if (value === null) {
    return <span className="text-[#c084fc]">null</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-[#c084fc]">{value ? 'true' : 'false'}</span>;
  }

  if (typeof value === 'number') {
    return <span className="text-[#fb923c]">{value}</span>;
  }

  if (typeof value === 'string') {
    const link = validatorLink(objKey, value);
    if (link) {
      return (
        <RouterLink
          to={link}
          title="Open validator"
          className="text-[#4ade80] underline decoration-dotted underline-offset-2 hover:text-[#ef4444] transition-colors"
        >
          {JSON.stringify(value)}
        </RouterLink>
      );
    }
    return <span className="text-[#4ade80]">{JSON.stringify(value)}</span>;
  }

  if (isArray) {
    const arr = value as unknown[];
    if (arr.length === 0) {
      return <span className="text-muted-foreground">[]</span>;
    }

    if (!open) {
      return (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity"
        >
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">
            Array [{arr.length} items]
          </span>
        </button>
      );
    }

    return (
      <span>
        <button
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-0.5 hover:opacity-70 transition-opacity"
        >
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
        <span className="text-muted-foreground">[</span>
        {arr.slice(0, ARRAY_RENDER_CAP).map((item, i) => (
          <div key={i} style={indent}>
            <JsonNode value={item} depth={depth + 1} />
            {i < arr.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
        {arr.length > ARRAY_RENDER_CAP && (
          <div style={indent} className="text-muted-foreground text-xs italic">
            … {(arr.length - ARRAY_RENDER_CAP).toLocaleString()} more item{arr.length - ARRAY_RENDER_CAP === 1 ? '' : 's'} not shown — use Copy JSON for the full response
          </div>
        )}
        <div style={{ paddingLeft: `${(depth) * 16}px` }}>
          <span className="text-muted-foreground">]</span>
        </div>
      </span>
    );
  }

  if (isObject) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return <span className="text-muted-foreground">{'{}'}</span>;
    }

    if (!open) {
      return (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity"
        >
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">
            Object {'{'}
            {keys.length} keys{'}'}
          </span>
        </button>
      );
    }

    return (
      <span>
        <button
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-0.5 hover:opacity-70 transition-opacity"
        >
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
        <span className="text-muted-foreground">{'{'}</span>
        {keys.map((key, i) => (
          <div key={key} style={indent}>
            <KeyLabel name={key} />
            <span className="text-muted-foreground">: </span>
            <JsonNode value={obj[key]} depth={depth + 1} objKey={key} />
            {i < keys.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
        <div style={{ paddingLeft: `${(depth) * 16}px` }}>
          <span className="text-muted-foreground">{'}'}</span>
        </div>
      </span>
    );
  }

  return <span className="text-muted-foreground">{String(value)}</span>;
}

// ─── Copy Link Button ────────────────────────────────────────────────────────

function CopyLinkButton({ getShareUrl }: { getShareUrl?: () => string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    // Prefer a URL built from current state (avoids the debounced address-bar
    // sync lagging behind recent param edits); fall back to the live location.
    let text: string;
    if (getShareUrl) {
      text = getShareUrl();
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set('autorun', '1');
      text = url.toString();
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      title="Copy shareable link"
    >
      <Link className="w-3.5 h-3.5" />
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}

// ─── ResponsePanel ────────────────────────────────────────────────────────────

// ─── Table view ──────────────────────────────────────────────────────────
// Renders a list response (data[] of flat objects) as a scrollable table —
// far more scannable than raw JSON for blocks/txs/validators/chains/etc.

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return Array.isArray(v) ? `[${(v as unknown[]).length}]` : '{…}';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

function TableView({ rows, columns }: { rows: Record<string, unknown>[]; columns: string[] }) {
  return (
    <div className="flex-1 overflow-auto scrollbar-hide">
      <table className="w-full text-xs font-mono border-collapse">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b border-border">
            {columns.map((c) => {
              const hint = fieldHint(c);
              return (
                <th key={c} className="text-left font-semibold text-muted-foreground px-3 py-2 whitespace-nowrap">
                  {hint ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted underline-offset-2 decoration-muted-foreground/50">{c}</span>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        align="start"
                        className="max-w-[260px] bg-popover border border-border text-foreground text-[11px] normal-case font-normal tracking-normal leading-relaxed px-3 py-2 shadow-xl [&>span]:hidden"
                      >
                        {hint}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    c
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-accent/40">
              {columns.map((c) => {
                const text = formatCell(row[c]);
                const link = validatorLink(c, row[c]);
                return (
                  <td
                    key={c}
                    title={text.length > 28 ? text : undefined}
                    className="px-3 py-1.5 whitespace-nowrap max-w-[22rem] truncate tabular-nums text-foreground/90"
                  >
                    {link ? (
                      <RouterLink to={link} className="underline decoration-dotted underline-offset-2 hover:text-[#ef4444] transition-colors">
                        {text}
                      </RouterLink>
                    ) : (
                      text
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ResponsePanelProps {
  response: unknown | null;
  status: number | null;
  durationMs: number | null;
  networkError: string | null;
  isLoading: boolean;
  onLoadNextPage: (() => void) | null;
  suggestedNext: EndpointDef[];
  onSuggestSelect: (id: string) => void;
  onRetryAfter?: (seconds: number) => void;
  headers?: Record<string, string> | null;
  getShareUrl?: () => string;
}

// Cap on consecutive automatic retries before we hand control back to the user.
const MAX_AUTO_RETRIES = 3;

function countLines(data: unknown): number {
  try {
    return JSON.stringify(data, null, 2).split('\n').length;
  } catch {
    return 0;
  }
}

export function ResponsePanel({
  response,
  status,
  durationMs,
  networkError,
  isLoading,
  onLoadNextPage,
  suggestedNext,
  onSuggestSelect,
  onRetryAfter,
  headers,
  getShareUrl,
}: ResponsePanelProps) {
  const [copiedJson, setCopiedJson] = useState(false);
  const [showHeaders, setShowHeaders] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [expandSig, setExpandSig] = useState(0);
  const [collapseSig, setCollapseSig] = useState(0);
  const [viewMode, setViewMode] = useState<'json' | 'table' | 'chart'>('json');
  // Count consecutive 429s so we stop auto-retrying instead of looping forever.
  // Note: `status` is briefly null while a retry is in flight — don't treat that
  // transient as a reset, or the counter would never climb.
  const [autoRetries, setAutoRetries] = useState(0);
  useEffect(() => {
    if (status === 429) setAutoRetries((n) => n + 1);
    else if (status !== null) setAutoRetries(0);
  }, [response, status]);

  const copyJson = useCallback(() => {
    try {
      navigator.clipboard.writeText(JSON.stringify(response, null, 2)).then(() => {
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 1500);
      });
    } catch {
      // ignore
    }
  }, [response]);

  const expandAll = () => setExpandSig((s) => s + 1);
  const collapseAll = () => setCollapseSig((s) => s + 1);

  // Reset to default open state when a new response arrives
  const prevResponseRef = useRef(response);
  useEffect(() => {
    if (prevResponseRef.current !== response) {
      prevResponseRef.current = response;
      setGeneration((g) => g + 1);
      setViewMode('json');
    }
  }, [response]);

  // Empty state
  if (!isLoading && response === null && !networkError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
        <Terminal className="w-10 h-10 opacity-30" />
        <p className="text-sm">Execute a request to see the response</p>
        <p className="text-xs opacity-60">
          {typeof navigator !== 'undefined' &&
          (navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac'))
            ? '⌘↵ to run'
            : 'Ctrl+↵ to run'}
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  // Network error
  if (networkError) {
    return (
      <div className="m-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400">
        <div className="flex items-center gap-2 font-medium mb-1">
          <AlertCircle className="w-4 h-4" />
          Network Error
        </div>
        <p className="text-sm font-mono">{networkError}</p>
      </div>
    );
  }

  if (response === null || status === null) return null;

  // Rate limit handling
  if (status === 429 && onRetryAfter) {
    const body = response as Record<string, unknown>;
    const retryAfter =
      typeof body?.retry_after === 'number' ? body.retry_after : 10;
    return (
      <RateLimitCard
        key={`${retryAfter}-${durationMs}`}
        retryAfter={retryAfter}
        autoRetry={autoRetries <= MAX_AUTO_RETRIES}
        onRetry={() => onRetryAfter(retryAfter)}
      />
    );
  }

  // Error card for 4xx/5xx
  if (status >= 400) {
    const errorBody = response as Record<string, unknown>;
    const err = errorBody?.error as Record<string, unknown> | undefined;

    if (err) {
      return (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Summary bar */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 flex-wrap gap-y-2">
            <StatusBadge status={status} />
            {durationMs !== null && (
              <span className="text-sm text-muted-foreground">{durationMs}ms</span>
            )}
          </div>
          <div className="m-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            {!!err.code && (
              <div className="font-mono text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2">
                {String(err.code)}
              </div>
            )}
            {!!err.message && (
              <div className="text-sm text-foreground mb-1">
                {String(err.message)}
              </div>
            )}
            {!!err.details && (
              <div className="text-xs text-muted-foreground font-mono">
                {String(err.details)}
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  // Success response
  const responseObj = response as Record<string, unknown> | unknown[];
  const meta = !Array.isArray(responseObj)
    ? (responseObj?.meta as Record<string, unknown> | undefined)
    : undefined;
  const dataField = !Array.isArray(responseObj) ? responseObj?.data : responseObj;
  const lineCount = countLines(response);

  // A table is feasible when data is a non-empty array of plain objects.
  const tableRows =
    Array.isArray(dataField) &&
    dataField.length > 0 &&
    dataField.every((r) => r && typeof r === 'object' && !Array.isArray(r))
      ? (dataField as Record<string, unknown>[])
      : null;
  const columns = tableRows
    ? Array.from(
        tableRows.slice(0, 100).reduce((set, row) => {
          Object.keys(row).forEach((k) => set.add(k));
          return set;
        }, new Set<string>()),
      )
    : [];
  const chartSeries = extractSeries(response);
  const showTable = tableRows !== null && viewMode === 'table';
  const showChart = chartSeries !== null && viewMode === 'chart';
  const jsonView = !showTable && !showChart;
  const headerEntries = headers ? Object.entries(headers) : [];
  // Rate-limit headers (token bucket): Limit = burst capacity, Remaining =
  // tokens left, Reset = epoch second the bucket refills. Sustained 60/min.
  const rlLimit = headers?.['x-ratelimit-limit'] != null ? Number(headers['x-ratelimit-limit']) : null;
  const rlRemaining = headers?.['x-ratelimit-remaining'] != null ? Number(headers['x-ratelimit-remaining']) : null;
  const rlResetIn =
    headers?.['x-ratelimit-reset'] != null
      ? Math.max(0, Math.round(Number(headers['x-ratelimit-reset']) - Date.now() / 1000))
      : null;

  return (
    <TooltipProvider delayDuration={150}>
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Summary bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 flex-wrap gap-y-2 flex-shrink-0">
        <StatusBadge status={status} />
        {durationMs !== null && (
          <span className="text-sm text-muted-foreground">{durationMs}ms</span>
        )}
        {Array.isArray(dataField) && (
          <span className="text-sm text-muted-foreground">
            {dataField.length} results
          </span>
        )}
        {meta?.total != null && (
          <span className="text-sm text-muted-foreground">
            {Number(meta.total).toLocaleString()} total
          </span>
        )}
        {!!meta?.has_more && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
            has more
          </span>
        )}
        {rlRemaining !== null && rlLimit !== null && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              rlRemaining === 0
                ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                : rlRemaining <= 3
                ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {rlRemaining}/{rlLimit} req left
            {rlRemaining === 0 && rlResetIn !== null ? ` · resets ${rlResetIn}s` : ''}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {(tableRows || chartSeries) && (
            <div className="flex items-center rounded-md border border-border overflow-hidden text-xs">
              <button
                onClick={() => setViewMode('json')}
                className={`px-2 py-0.5 transition-colors ${jsonView ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                JSON
              </button>
              {tableRows && (
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-2 py-0.5 border-l border-border transition-colors ${showTable ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Table
                </button>
              )}
              {chartSeries && (
                <button
                  onClick={() => setViewMode('chart')}
                  className={`px-2 py-0.5 border-l border-border transition-colors ${showChart ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Chart
                </button>
              )}
            </div>
          )}
          {jsonView && <span className="text-xs text-muted-foreground">{lineCount} lines</span>}
          {jsonView && (
            <button
              onClick={expandAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Expand all
            </button>
          )}
          {jsonView && (
            <button
              onClick={collapseAll}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Collapse all
            </button>
          )}
          {headerEntries.length > 0 && (
            <button
              onClick={() => setShowHeaders((s) => !s)}
              className={`text-xs transition-colors ${showHeaders ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Headers
            </button>
          )}
          <CopyLinkButton getShareUrl={getShareUrl} />
          <button
            onClick={copyJson}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Copy className="w-3.5 h-3.5" />
            {copiedJson ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>

      {/* Response headers (only those readable cross-origin via CORS) */}
      {showHeaders && headerEntries.length > 0 && (
        <div className="px-6 py-3 border-b border-border bg-muted/30 flex-shrink-0 text-xs font-mono space-y-1">
          {headerEntries.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-[#60a5fa] shrink-0">{k}:</span>
              <span className="text-foreground/80 break-all">{v}</span>
            </div>
          ))}
          <div className="text-[10px] text-muted-foreground/70 font-sans pt-1">
            Only CORS-safelisted headers are visible to the browser (Cache-Control, Content-Type, …).
          </div>
        </div>
      )}

      {/* Table view */}
      {showTable && tableRows && <TableView rows={tableRows} columns={columns} />}

      {/* Chart view */}
      {showChart && chartSeries && <ChartView series={chartSeries} />}

      {/* JSON Viewer */}
      {jsonView && (
      <div className="flex-1 overflow-auto scrollbar-hide">
        <pre className="font-mono text-xs leading-relaxed p-6">
          <ExpandContext.Provider value={{ expandSig, collapseSig, generation }}>
            <JsonNode value={response} depth={0} />
          </ExpandContext.Provider>
        </pre>

        {/* Load More — inline at the bottom of the data */}
        {onLoadNextPage && (
          <div className="px-6 pb-6">
            <button
              onClick={onLoadNextPage}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border hover:border-[#ef4444]/50 hover:bg-[#ef4444]/5 text-sm text-muted-foreground hover:text-foreground transition-all duration-150"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Load more results
            </button>
          </div>
        )}
      </div>
      )}

      {/* Suggested follow-ups */}
      {suggestedNext.length > 0 && (
        <div className="px-6 py-4 border-t border-border flex-shrink-0">
          <p className="text-xs text-muted-foreground mb-2">Try next</p>
          <div className="flex flex-wrap gap-2">
            {suggestedNext.map((e) => (
              <button
                key={e.id}
                onClick={() => onSuggestSelect(e.id)}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-[#ef4444]/50 hover:bg-[#ef4444]/5 text-muted-foreground hover:text-foreground transition-all"
              >
                {e.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}
