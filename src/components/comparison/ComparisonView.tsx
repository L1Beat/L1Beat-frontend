import { memo, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Chain, DailyTxCount, DailyActiveAddresses, MaxTPSHistory, GasUsedHistory, AvgGasPriceHistory, FeesPaidHistory, L1BeatFeeMetrics } from '../../types';
import { Link } from 'react-router-dom';
import { Plus, X, Share2, Check } from 'lucide-react';
import { ChainSelector } from './ChainSelector';
import { ComparisonChart, ComparisonMetricType, formatValue } from './ComparisonChart';
import { seriesColor } from './colors';
import { SegmentedControl } from '../instrument';
import { getDailyActiveAddresses, getChainTxCountHistory, getChainMaxTPSHistory, getChainGasUsedHistory, getChainAvgGasPriceHistory, getChainFeesPaidHistory, getChains, getL1BeatFeeMetrics } from '../../api';
import { LoadingSpinner } from '../LoadingSpinner';

interface ComparisonViewProps {
  currentChain?: Chain;
  availableChains?: Chain[];
  validatorCountBySubnet?: Record<string, number>;
}

interface ChainComparisonData {
  chain: Chain;
  dailyActiveAddresses: DailyActiveAddresses[];
  dailyTxCount: DailyTxCount[];
  maxTPS: MaxTPSHistory[];
  gasUsed: GasUsedHistory[];
  avgGasPrice: AvgGasPriceHistory[];
  feesPaid: FeesPaidHistory[];
  feeMetrics: L1BeatFeeMetrics | null;
  loading: boolean;
}


const COMPARISON_METRICS: { id: ComparisonMetricType; name: string; shortName: string; valueLabel: string }[] = [
  { id: 'dailyActiveAddresses', name: 'Daily Active Addresses', shortName: 'Active addresses', valueLabel: 'addresses' },
  { id: 'dailyTxCount', name: 'Daily Transaction Count', shortName: 'Transactions', valueLabel: 'transactions' },
  { id: 'maxTPS', name: 'Daily Max TPS', shortName: 'Max TPS', valueLabel: 'TPS' },
  { id: 'gasUsed', name: 'Daily Gas Used', shortName: 'Gas used', valueLabel: 'gas' },
  { id: 'feesPaid', name: 'Daily Fees Paid', shortName: 'Fees paid', valueLabel: '' },
];

function formatCompact(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (value < 1 && value > 0) return value.toFixed(2);
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function getMetricSeries(data: ChainComparisonData, metric: ComparisonMetricType): number[] {
  const points =
    metric === 'dailyActiveAddresses'
      ? data.dailyActiveAddresses.map(d => d.activeAddresses)
      : metric === 'dailyTxCount'
      ? data.dailyTxCount.map(d => d.value)
      : metric === 'maxTPS'
      ? data.maxTPS.map(d => d.value)
      : metric === 'gasUsed'
      ? data.gasUsed.map(d => d.value)
      : metric === 'avgGasPrice'
      ? data.avgGasPrice.map(d => d.value)
      : data.feesPaid.map(d => d.value);
  return points.map(v => Number(v) || 0);
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <span className="text-muted-foreground">—</span>;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const areaPath = `M 0,100 L ${points.replace(/ /g, ' L ')} L 100,100 Z`;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="w-full h-5 block"
      style={{ color }}
      aria-hidden="true"
    >
      <path d={areaPath} fill="currentColor" fillOpacity={0.1} />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export const ComparisonView = memo(function ComparisonView({
  currentChain,
  availableChains: providedChains,
  validatorCountBySubnet = {}
}: ComparisonViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [comparisonChains, setComparisonChains] = useState<ChainComparisonData[]>([]);
  const [availableChains, setAvailableChains] = useState<Chain[]>(providedChains || []);
  const [chainsLoading, setChainsLoading] = useState(!providedChains);
  const [urlInitialized, setUrlInitialized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredChainId, setHoveredChainId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'absolute' | 'normalized'>('absolute');

  const metricParam = searchParams.get('metric');
  const selectedMetric: ComparisonMetricType = COMPARISON_METRICS.some(m => m.id === metricParam)
    ? metricParam as ComparisonMetricType
    : 'dailyActiveAddresses';

  const timeframeParam = searchParams.get('timeframe');
  const timeframe = (timeframeParam === '30' ? 30 : 7) as 7 | 30;

  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const updateUrl = useCallback((chainIds: string[], newTimeframe?: number, newMetric?: ComparisonMetricType) => {
    const newParams = new URLSearchParams(searchParamsRef.current);
    if (chainIds.length > 0) {
      newParams.set('compare', chainIds.join(','));
    } else {
      newParams.delete('compare');
    }
    newParams.set('timeframe', String(newTimeframe ?? timeframe));
    newParams.set('metric', newMetric ?? selectedMetric);
    setSearchParams(newParams, { replace: true });
  }, [setSearchParams, timeframe, selectedMetric]);

  const handleTimeframeChange = useCallback((newTimeframe: 7 | 30) => {
    const chainIds = comparisonChains.map(c => c.chain.chainId);
    updateUrl(chainIds, newTimeframe);
  }, [comparisonChains, updateUrl]);

  const handleMetricChange = useCallback((metric: ComparisonMetricType) => {
    const chainIds = comparisonChains.map(c => c.chain.chainId);
    updateUrl(chainIds, undefined, metric);
  }, [comparisonChains, updateUrl]);

  const handleCopyShareUrl = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const filterChains = (chains: Chain[]) =>
      chains
        .filter(chain => chain.validatorCount && chain.validatorCount >= 1 && chain.network === 'mainnet')
        .filter(chain => { const name = chain.chainName.toLowerCase(); return !name.includes('x-chain') && !name.includes('p-chain'); });

    if (providedChains) {
      setAvailableChains(filterChains(providedChains));
      setChainsLoading(false);
      return;
    }
    async function fetchAvailableChains() {
      setChainsLoading(true);
      try {
        const chains = await getChains({ network: 'mainnet' });
        const filtered = filterChains(chains)
          .sort((a, b) => {
            const isCChainA = a.chainName.toLowerCase().includes('c-chain');
            const isCChainB = b.chainName.toLowerCase().includes('c-chain');
            if (isCChainA && !isCChainB) return -1;
            if (!isCChainA && isCChainB) return 1;
            return a.chainName.localeCompare(b.chainName);
          });
        setAvailableChains(filtered);
      } catch (error) {
        console.error('Failed to fetch chains:', error);
      } finally {
        setChainsLoading(false);
      }
    }
    fetchAvailableChains();
  }, [providedChains]);

  const fetchChainData = useCallback(async (chain: Chain) => {
    const targetChainId = chain.chainId;
    try {
      const apiChainId = chain.originalChainId || chain.chainId;
      const evmChainIdStr = chain.evmChainId ? String(chain.evmChainId) : apiChainId;
      const [activeAddresses, dailyTx, maxTps, gasUsedData, avgGasPriceData, feesPaidData, feeMetricsData] = await Promise.all([
        getDailyActiveAddresses(evmChainIdStr, timeframe).catch(() => []),
        getChainTxCountHistory(apiChainId, timeframe).catch(() => []),
        getChainMaxTPSHistory(apiChainId, timeframe).catch(() => []),
        getChainGasUsedHistory(apiChainId, timeframe).catch(() => []),
        getChainAvgGasPriceHistory(apiChainId, timeframe).catch(() => []),
        getChainFeesPaidHistory(apiChainId, timeframe).catch(() => []),
        chain.subnetId ? getL1BeatFeeMetrics(chain.subnetId).then(r => r[0] ?? null).catch(() => null) : Promise.resolve(null),
      ]);
      setComparisonChains(prev => {
        const idx = prev.findIndex(c => c.chain.chainId === targetChainId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { chain, dailyActiveAddresses: activeAddresses, dailyTxCount: dailyTx, maxTPS: maxTps, gasUsed: gasUsedData, avgGasPrice: avgGasPriceData, feesPaid: feesPaidData, feeMetrics: feeMetricsData, loading: false };
        return updated;
      });
    } catch {
      setComparisonChains(prev => {
        const idx = prev.findIndex(c => c.chain.chainId === targetChainId);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], loading: false };
        return updated;
      });
    }
  }, [timeframe]);

  useEffect(() => {
    if (chainsLoading || urlInitialized || availableChains.length === 0) return;
    const compareParam = searchParams.get('compare');
    if (compareParam) {
      const chainIds = compareParam.split(',').filter(Boolean).slice(0, 4);
      const initialChains: ChainComparisonData[] = [];
      chainIds.forEach(chainId => {
        const chain = availableChains.find(c => c.chainId === chainId);
        if (chain) {
          initialChains.push({ chain, dailyActiveAddresses: [], dailyTxCount: [], maxTPS: [], gasUsed: [], avgGasPrice: [], feesPaid: [], feeMetrics: null, loading: true });
        }
      });
      if (initialChains.length > 0) {
        setComparisonChains(initialChains);
        initialChains.forEach(data => fetchChainData(data.chain));
      }
    } else if (currentChain) {
      setComparisonChains([{ chain: currentChain, dailyActiveAddresses: [], dailyTxCount: [], maxTPS: [], gasUsed: [], avgGasPrice: [], feesPaid: [], feeMetrics: null, loading: true }]);
      fetchChainData(currentChain);
      updateUrl([currentChain.chainId]);
    }
    setUrlInitialized(true);
  }, [chainsLoading, availableChains, urlInitialized, searchParams, currentChain, fetchChainData, updateUrl]);

  const prevTimeframeRef = useRef(timeframe);
  useEffect(() => {
    if (prevTimeframeRef.current === timeframe) return;
    prevTimeframeRef.current = timeframe;
    setComparisonChains(prev => prev.length === 0 ? prev : prev.map(c => ({ ...c, loading: true })));
    comparisonChains.forEach(data => fetchChainData(data.chain));
  }, [timeframe, fetchChainData]);

  const handleAddChain = (chain: Chain) => {
    if (comparisonChains.length >= 4) return;
    if (comparisonChains.some(c => c.chain.chainId === chain.chainId)) return;
    const newChains = [...comparisonChains, { chain, dailyActiveAddresses: [], dailyTxCount: [], maxTPS: [], gasUsed: [], avgGasPrice: [], feesPaid: [], feeMetrics: null, loading: true }];
    setComparisonChains(newChains);
    updateUrl(newChains.map(c => c.chain.chainId));
    fetchChainData(chain);
    setIsModalOpen(false);
  };

  const handleRemoveChain = (chainId: string) => {
    const newChains = comparisonChains.filter(c => c.chain.chainId !== chainId);
    setComparisonChains(newChains);
    updateUrl(newChains.map(c => c.chain.chainId));
  };

  const handleClearAll = () => {
    setComparisonChains([]);
    updateUrl([]);
  };

  const handleApplyPreset = (chains: Chain[]) => {
    const picks = chains.slice(0, 4);
    if (picks.length === 0) return;
    const newChains: ChainComparisonData[] = picks.map(chain => ({
      chain,
      dailyActiveAddresses: [],
      dailyTxCount: [],
      maxTPS: [],
      gasUsed: [],
      avgGasPrice: [],
      feesPaid: [],
      feeMetrics: null,
      loading: true,
    }));
    setComparisonChains(newChains);
    updateUrl(picks.map(c => c.chainId));
    picks.forEach(chain => fetchChainData(chain));
  };

  const presets = useMemo(() => {
    if (availableChains.length === 0) return [];
    const byTps = [...availableChains]
      .sort((a, b) => (b.tps?.value ?? 0) - (a.tps?.value ?? 0))
      .slice(0, 4);
    const byValidators = [...availableChains]
      .sort((a, b) => (b.validatorCount ?? 0) - (a.validatorCount ?? 0))
      .slice(0, 4);
    const GAMING_NAMES = ['beam', 'gunz', 'henesy', 'dfk'];
    const gaming = GAMING_NAMES
      .map(needle => availableChains.find(c => c.chainName.toLowerCase().includes(needle)))
      .filter((c): c is Chain => !!c)
      .slice(0, 4);
    const list: { id: string; label: string; chains: Chain[] }[] = [
      { id: 'tps', label: 'Top 4 by TPS', chains: byTps },
      { id: 'validators', label: 'Top 4 by Validators', chains: byValidators },
    ];
    if (gaming.length >= 2) list.push({ id: 'gaming', label: 'Gaming L1s', chains: gaming });
    return list;
  }, [availableChains]);

  const activePresetId = useMemo(() => {
    if (comparisonChains.length === 0) return null;
    const currentIds = comparisonChains.map(c => c.chain.chainId).sort().join(',');
    for (const p of presets) {
      const presetIds = p.chains.map(c => c.chainId).sort().join(',');
      if (presetIds === currentIds) return p.id;
    }
    return null;
  }, [presets, comparisonChains]);

  const selectedChainIds = comparisonChains.map(c => c.chain.chainId);

  const currentMetricConfig = COMPARISON_METRICS.find(m => m.id === selectedMetric) || COMPARISON_METRICS[0];

  // Compute per-chain stats for cards
  const NAVAX_TO_AVAX = 1_000_000_000;

  // null means the chain has no data for it, shown as '—' rather than 0.
  const chainStats = useMemo(() => {
    const last = <T extends { value: number }>(xs: T[]) => (xs.length > 0 ? xs[xs.length - 1].value : null);
    return comparisonChains.map(data => ({
      maxTps: last(data.maxTPS),
      validators: (data.chain.subnetId ? validatorCountBySubnet[data.chain.subnetId] : undefined) ?? data.chain.validatorCount ?? null,
      dailyTx: last(data.dailyTxCount),
      feesBurned: data.feeMetrics ? data.feeMetrics.total_fees_paid / NAVAX_TO_AVAX : null,
      loading: data.loading,
    }));
  }, [comparisonChains, validatorCountBySubnet]);

  // The largest value in each column, set in a heavier weight when two or more chains are compared.
  const leaders = useMemo(() => {
    const top = (vals: (number | null)[]) => {
      const nums = vals.filter((v): v is number => v != null && v > 0);
      return comparisonChains.length >= 2 && nums.length >= 2 ? Math.max(...nums) : null;
    };
    return {
      maxTps: top(chainStats.map(s => s.maxTps)),
      validators: top(chainStats.map(s => s.validators)),
      dailyTx: top(chainStats.map(s => s.dailyTx)),
      feesBurned: top(chainStats.map(s => s.feesBurned)),
    };
  }, [chainStats, comparisonChains.length]);

  if (chainsLoading) {
    return (
      <div className="rounded-md border border-border bg-card h-40 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const cell = (value: number | null, leader: number | null, fmt: (v: number) => string) =>
    value == null ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <span className={value === leader ? 'font-semibold text-foreground' : 'text-foreground'}>{fmt(value)}</span>
    );
  const slotsLeft = 4 - comparisonChains.length;
  const metricLabel = currentMetricConfig.shortName.toLowerCase();

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Compare chains</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {comparisonChains.length < 2
              ? 'Pick up to 4 L1s, or start from a preset.'
              : `${comparisonChains.length} chains, ${timeframe} days`}
          </p>
        </div>
        {presets.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            {presets.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleApplyPreset(p.chains)}
                disabled={p.chains.length === 0}
                aria-pressed={activePresetId === p.id}
                className={`shrink-0 h-7 px-2.5 rounded border text-[12px] font-medium transition-colors disabled:opacity-50 ${
                  activePresetId === p.id
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-card overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border text-[11px] text-muted-foreground">
              <th className="text-left font-normal py-2 pl-4 pr-3">Chain</th>
              <th className="hidden sm:table-cell text-right font-normal py-2 px-3">Max TPS</th>
              <th className="hidden sm:table-cell text-right font-normal py-2 px-3">Validators</th>
              <th className="text-right font-normal py-2 px-3">Txs, last day</th>
              <th className="hidden md:table-cell text-right font-normal py-2 px-3" title="All-time validation fees paid to the P-Chain. Legacy subnets don't pay them.">Fees burned</th>
              <th className="hidden lg:table-cell text-left font-normal py-2 px-3 w-[22%]">{currentMetricConfig.shortName}, {timeframe}d</th>
              <th className="py-2 pr-3 w-8"><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {comparisonChains.map((data, index) => {
              const color = seriesColor(index);
              const st = chainStats[index];
              const dim = hoveredChainId != null && hoveredChainId !== data.chain.chainId;
              return (
                <tr
                  key={data.chain.chainId}
                  onMouseEnter={() => setHoveredChainId(data.chain.chainId)}
                  onMouseLeave={() => setHoveredChainId(null)}
                  className={`h-10 transition-opacity ${dim ? 'opacity-50' : ''}`}
                >
                  <td className="pl-4 pr-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span aria-hidden className="w-[3px] h-4 rounded-sm shrink-0" style={{ background: color }} />
                      {data.chain.chainLogoUri ? (
                        <img src={data.chain.chainLogoUri} alt="" className="w-4 h-4 rounded-full object-cover bg-muted shrink-0" loading="lazy" />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-muted shrink-0" />
                      )}
                      <Link to={`/chain/${data.chain.chainId}`} className="truncate font-medium text-foreground hover:underline underline-offset-2">
                        {data.chain.chainName}
                      </Link>
                    </div>
                  </td>
                  {st.loading ? (
                    <td colSpan={5} className="px-3 text-right text-muted-foreground">Loading…</td>
                  ) : (
                    <>
                      <td className="hidden sm:table-cell num px-3 text-right">{cell(st.maxTps, leaders.maxTps, v => v.toFixed(2))}</td>
                      <td className="hidden sm:table-cell num px-3 text-right">{cell(st.validators, leaders.validators, v => v.toLocaleString())}</td>
                      <td className="num px-3 text-right">{cell(st.dailyTx, leaders.dailyTx, formatCompact)}</td>
                      <td className="hidden md:table-cell num px-3 text-right">
                        {cell(st.feesBurned, leaders.feesBurned, v => `${formatCompact(v)} AVAX`)}
                      </td>
                      <td className="hidden lg:table-cell px-3">
                        <Sparkline values={getMetricSeries(data, selectedMetric)} color={color} />
                      </td>
                    </>
                  )}
                  <td className="pr-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveChain(data.chain.chainId)}
                      aria-label={`Remove ${data.chain.chainName}`}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {slotsLeft > 0 && (
              <tr className="h-10">
                <td colSpan={7} className="px-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add chain
                    <span className="font-normal">({slotsLeft} of 4 open)</span>
                  </button>
                  {comparisonChains.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="ml-4 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {comparisonChains.length > 0 && (
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <div className="flex flex-col gap-2 px-4 py-3 border-b border-border lg:flex-row lg:items-center lg:justify-between">
            <div className="overflow-x-auto no-scrollbar -mx-4 px-4 lg:mx-0 lg:px-0 shrink-0 max-w-full">
              <SegmentedControl
                value={selectedMetric}
                options={COMPARISON_METRICS.map(m => ({ value: m.id, label: m.shortName }))}
                onChange={handleMetricChange}
                ariaLabel="Metric"
              />
            </div>
            <div className="flex items-center gap-2">
              <SegmentedControl
                value={viewMode}
                options={[{ value: 'absolute', label: 'Values' }, { value: 'normalized', label: 'Shape' }] as const}
                onChange={setViewMode}
                ariaLabel="Scale"
              />
              <SegmentedControl
                value={String(timeframe) as '7' | '30'}
                options={[{ value: '7', label: '7D' }, { value: '30', label: '30D' }] as const}
                onChange={v => handleTimeframeChange(Number(v) as 7 | 30)}
                ariaLabel="Range"
              />
              <button
                type="button"
                onClick={handleCopyShareUrl}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-border text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Share2 className="w-3 h-3" />}
                {copied ? 'Link copied' : 'Share'}
              </button>
            </div>
          </div>
          <div className="px-2 pt-3 sm:px-4">
            <ComparisonChart
              comparisonChains={comparisonChains}
              metricType={selectedMetric}
              valueLabel={currentMetricConfig.valueLabel}
              hoveredChainId={hoveredChainId}
              onHoverChain={setHoveredChainId}
              viewMode={viewMode}
            />
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3 text-[11px]">
            <div className="text-muted-foreground">
              {viewMode === 'normalized' ? `Latest ${metricLabel}; each line is scaled to its own range` : `Latest ${metricLabel}`}
            </div>
            {comparisonChains.map((data, index) => {
              const series = getMetricSeries(data, selectedMetric);
              const latest = series.length > 0 ? series[series.length - 1] : null;
              return (
                <div key={data.chain.chainId} className="flex items-center gap-1.5">
                  <span aria-hidden className="w-2 h-2 rounded-sm" style={{ background: seriesColor(index) }} />
                  <dt className="text-muted-foreground">{data.chain.chainName}</dt>
                  <dd className="num text-foreground">{latest == null ? '—' : formatValue(latest, selectedMetric)}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}

      <ChainSelector
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        chains={availableChains}
        selectedChainIds={selectedChainIds}
        onSelectChain={handleAddChain}
        maxChains={4}
      />
    </div>
  );
});
