import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  ChevronRight,
  Download,
  LayoutGrid,
  MessageSquare,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import {
  getAllChainsTPSLatest,
  getCategories,
  getChains,
  getNetworkTxCountHistory,
  getNetworkValidatorTotal,
  getTPSHistory,
  getTeleporterMessages,
} from '../api';
import type { Chain } from '../types';
import { FilterModal } from '../components/FilterModal';
import { LoadingPage, LoadingSpinner } from '../components/LoadingSpinner';

type Range = '1H' | '24H' | '7D' | '30D' | 'ALL';
type ScreenerTab = 'active' | 'all' | 'inactive';

const RANGES: Range[] = ['1H', '24H', '7D', '30D', 'ALL'];
const CHAINS_PER_PAGE = 25;

interface NetworkMetrics {
  totalTps: number | null;
  txCount24h: number | null;
  validators: number | null;
  icmMessages: number | null;
}

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatTps(value: number | undefined | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  if (value < 0.5) return '<1';
  return Math.round(value).toLocaleString();
}

export function Dashboard() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const [searchTerm, setSearchTerm] = useState(
    () => sessionStorage.getItem('dashboardSearch') || '',
  );
  const [currentPage, setCurrentPage] = useState(
    () => Number(sessionStorage.getItem('dashboardPage')) || 1,
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(
    () => sessionStorage.getItem('dashboardCategory') || '',
  );
  const [categories, setCategories] = useState<string[]>([]);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [validatorFilter, setValidatorFilter] = useState<ScreenerTab>(
    () => (sessionStorage.getItem('dashboardValidatorFilter') as ScreenerTab) || 'active',
  );
  const [range, setRange] = useState<Range>('24H');

  const [icmMessageCounts, setIcmMessageCounts] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<NetworkMetrics>({
    totalTps: null,
    txCount24h: null,
    validators: null,
    icmMessages: null,
  });

  async function fetchData() {
    try {
      if (chains.length === 0) {
        setLoading(true);
      } else {
        setIsRefetching(true);
      }
      setError(null);

      const filters: { category?: string; includeInactive?: boolean } = { includeInactive: true };
      if (selectedCategory) filters.category = selectedCategory;

      const [chainsData, categoriesData, tpsMap, teleporterData] = await Promise.all([
        getChains(filters),
        getCategories(),
        getAllChainsTPSLatest(),
        getTeleporterMessages(),
      ]);

      const icmCounts: Record<string, number> = {};
      if (teleporterData?.messages) {
        teleporterData.messages.forEach((msg) => {
          icmCounts[msg.source] = (icmCounts[msg.source] || 0) + msg.value;
          icmCounts[msg.target] = (icmCounts[msg.target] || 0) + msg.value;
        });
      }
      setIcmMessageCounts(icmCounts);

      const chainsWithLatestTps = chainsData.map((chain) => {
        const lookupId =
          (chain.evmChainId ? String(chain.evmChainId) : undefined) ||
          chain.originalChainId ||
          chain.chainId;
        const latest = lookupId ? tpsMap[lookupId] : undefined;
        if (!latest) return chain;
        return {
          ...chain,
          tps: { value: Number(latest.value), timestamp: Number(latest.timestamp) },
        };
      });

      const visible = chainsWithLatestTps.filter((chain) => {
        const name = chain.chainName.toLowerCase();
        return !name.includes('x-chain') && !name.includes('p-chain');
      });

      let filtered = visible;
      if (validatorFilter === 'active') filtered = filtered.filter((c) => c.isActive);
      else if (validatorFilter === 'inactive') filtered = filtered.filter((c) => !c.isActive);

      const sorted = filtered.sort((a, b) => {
        const isCa = a.chainName.toLowerCase().includes('c-chain');
        const isCb = b.chainName.toLowerCase().includes('c-chain');
        if (isCa && !isCb) return -1;
        if (!isCa && isCb) return 1;
        const aTps = a.tps?.value ?? -1;
        const bTps = b.tps?.value ?? -1;
        if (aTps !== bTps) return bTps - aTps;
        return a.chainName.localeCompare(b.chainName);
      });

      setChains(sorted);
      setCategories(categoriesData);
    } catch {
      setError('Unable to connect to the server. Please try again later.');
    } finally {
      setLoading(false);
      setIsRefetching(false);
      setRetrying(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [selectedCategory, validatorFilter]);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const [tpsHistory, txCountHistory, validatorTotal, teleporter] = await Promise.all([
          getTPSHistory(1),
          getNetworkTxCountHistory(1),
          getNetworkValidatorTotal(),
          getTeleporterMessages(),
        ]);
        const tps = tpsHistory?.[0]?.totalTps ?? null;
        const tx = txCountHistory?.[0]?.value ?? null;
        const icm = teleporter?.messages
          ? teleporter.messages.reduce((s, m) => s + m.value, 0)
          : null;
        setMetrics({
          totalTps: tps,
          txCount24h: tx,
          validators: validatorTotal?.totalValidators ?? null,
          icmMessages: icm,
        });
      } catch {
        // KPI strip is decorative; ignore failures
      }
    }
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    sessionStorage.setItem('dashboardSearch', searchTerm);
    sessionStorage.setItem('dashboardCategory', selectedCategory);
    sessionStorage.setItem('dashboardValidatorFilter', validatorFilter);
  }, [searchTerm, selectedCategory, validatorFilter]);

  useEffect(() => {
    sessionStorage.setItem('dashboardPage', String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, validatorFilter]);

  useEffect(() => {
    const saved = sessionStorage.getItem('dashboardScrollPosition');
    if (saved && !loading) {
      const scrollY = parseInt(saved, 10);
      setTimeout(() => {
        window.scrollTo(0, scrollY);
        sessionStorage.removeItem('dashboardScrollPosition');
      }, 0);
    }
  }, [loading]);

  const filteredChains = chains.filter(
    (chain) =>
      chain.chainName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chain.chainId.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const totalPages = Math.ceil(filteredChains.length / CHAINS_PER_PAGE);
  const paginatedChains = filteredChains.slice(
    (currentPage - 1) * CHAINS_PER_PAGE,
    currentPage * CHAINS_PER_PAGE,
  );
  const activeCount = chains.filter((c) => c.isActive).length;
  const tabCounts: Record<ScreenerTab, number> = {
    active: activeCount,
    all: chains.length,
    inactive: chains.length - activeCount,
  };

  if (loading) return <LoadingPage />;

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full text-center">
          <Activity className="h-12 w-12 text-[#ef4444] mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Connection Error</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <button
            onClick={() => {
              setRetrying(true);
              fetchData();
            }}
            disabled={retrying}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50"
          >
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <Hero range={range} onRangeChange={setRange} />
      <KpiCards metrics={metrics} activeChains={activeCount} />

      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <ScreenerHeader
          activeTab={validatorFilter}
          onTabChange={setValidatorFilter}
          counts={tabCounts}
          isRefetching={isRefetching}
          onOpenFilters={() => setIsFilterModalOpen(true)}
          filtersActive={Boolean(selectedCategory) || validatorFilter !== 'active'}
        />
        <ScreenerToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          categories={categories}
        />
        <AnimatePresence mode="wait">
          {filteredChains.length === 0 ? (
            <motion.div
              key="no-results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="px-6 py-16 text-center text-muted-foreground"
            >
              No L1s match "{searchTerm}"
            </motion.div>
          ) : (
            <motion.div
              key={`${selectedCategory}-${searchTerm}-${currentPage}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <ScreenerTable chains={paginatedChains} icmMessageCounts={icmMessageCounts} />
            </motion.div>
          )}
        </AnimatePresence>

        {totalPages > 1 && (
          <ScreenerPagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRows={filteredChains.length}
            pageSize={CHAINS_PER_PAGE}
            onChange={setCurrentPage}
          />
        )}
      </section>

      <FilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        categories={categories}
        validatorFilter={validatorFilter}
        onValidatorFilterChange={setValidatorFilter}
      />
    </div>
  );
}

function Hero({ range, onRangeChange }: { range: Range; onRangeChange: (r: Range) => void }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="text-[11px] font-bold tracking-[0.15em] text-[#ef4444] mb-1.5">
          AVALANCHE L1 NETWORK
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          What's moving across the L1s today?
        </h1>
      </div>
      <div className="flex items-center gap-1.5">
        {RANGES.map((r) => {
          const active = r === range;
          return (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
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
    </div>
  );
}

function KpiCards({
  metrics,
  activeChains,
}: {
  metrics: NetworkMetrics;
  activeChains: number;
}) {
  const cards = [
    {
      label: 'Active L1s',
      value: activeChains > 0 ? String(activeChains) : '—',
      icon: LayoutGrid,
    },
    {
      label: 'Network TPS',
      value: metrics.totalTps != null ? Math.round(metrics.totalTps).toLocaleString() : '—',
      icon: Activity,
    },
    {
      label: 'Validators',
      value: metrics.validators != null ? metrics.validators.toLocaleString() : '—',
      icon: Users,
    },
    {
      label: 'ICM Messages (24h)',
      value: metrics.icmMessages != null ? formatCount(metrics.icmMessages) : '—',
      icon: MessageSquare,
      footer: metrics.txCount24h != null ? `${formatCount(metrics.txCount24h)} tx 24h` : null,
    },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {cards.map(({ label, value, icon: Icon, footer }) => (
        <div key={label} className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground">
              {label}
            </span>
            <div className="w-7 h-7 rounded-lg bg-[#ef4444]/10 flex items-center justify-center">
              <Icon className="w-3.5 h-3.5 text-[#ef4444]" />
            </div>
          </div>
          <div className="text-2xl font-bold text-foreground tracking-tight">{value}</div>
          {footer && <div className="text-[11px] text-muted-foreground mt-1">{footer}</div>}
        </div>
      ))}
    </div>
  );
}

function ScreenerHeader({
  activeTab,
  onTabChange,
  counts,
  isRefetching,
  onOpenFilters,
  filtersActive,
}: {
  activeTab: ScreenerTab;
  onTabChange: (t: ScreenerTab) => void;
  counts: Record<ScreenerTab, number>;
  isRefetching: boolean;
  onOpenFilters: () => void;
  filtersActive: boolean;
}) {
  const tabs: Array<{ id: ScreenerTab; label: string }> = [
    { id: 'active', label: 'Active L1s' },
    { id: 'all', label: 'All' },
    { id: 'inactive', label: 'Inactive' },
  ];
  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between gap-4 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">L1 Screener</h2>
          <div className="flex items-center gap-1.5 px-2 h-5 rounded-full bg-green-500/10">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] font-bold tracking-wider text-green-500">LIVE</span>
          </div>
          {isRefetching && <LoadingSpinner size="sm" />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenFilters}
            className={`hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border transition-colors ${
              filtersActive
                ? 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
          </button>
          <button className="hidden sm:flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-card border border-border text-muted-foreground hover:text-foreground transition-colors">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>
      <nav className="flex items-center gap-1 px-4 sm:px-5">
        {tabs.map((t) => {
          const active = t.id === activeTab;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`flex items-center gap-2 h-9 px-3 -mb-px border-b-2 transition-colors ${
                active
                  ? 'border-[#ef4444] text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className={`text-xs ${active ? 'font-semibold' : 'font-medium'}`}>{t.label}</span>
              <span
                className={`text-[10px] font-bold px-1.5 h-4 inline-flex items-center rounded-full ${
                  active ? 'bg-[#ef4444]/15 text-[#ef4444]' : 'bg-muted text-muted-foreground'
                }`}
              >
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function ScreenerToolbar({
  searchTerm,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  categories,
}: {
  searchTerm: string;
  onSearchChange: (s: string) => void;
  selectedCategory: string;
  onCategoryChange: (c: string) => void;
  categories: string[];
}) {
  const quickCats = ['Gaming', 'DeFi', 'RWA', 'AI', 'DePIN'];
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-5 py-3 border-b border-border">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search L1s by name or ID…"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full h-9 pl-9 pr-9 rounded-lg bg-muted border border-border text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#ef4444]/30 focus:border-[#ef4444]/40"
        />
        {searchTerm && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {quickCats.map((cat) => {
          const matched = categories.find((c) => c.toLowerCase() === cat.toLowerCase());
          if (!matched) return null;
          const active = selectedCategory === matched;
          return (
            <button
              key={matched}
              onClick={() => onCategoryChange(active ? '' : matched)}
              className={`h-7 px-2.5 rounded-full text-[11px] font-medium border whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[#ef4444] border-[#ef4444] text-white'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScreenerTable({
  chains,
  icmMessageCounts,
}: {
  chains: Chain[];
  icmMessageCounts: Record<string, number>;
}) {
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b border-border">
            <Th align="left" className="pl-5">L1</Th>
            <Th align="right">TPS</Th>
            <Th align="right">Validators</Th>
            <Th align="right">Cumulative tx</Th>
            <Th align="right">ICM (24h)</Th>
            <Th align="right" className="pr-5">Status</Th>
          </tr>
        </thead>
        <tbody>
          {chains.map((chain, idx) => {
            const icm = icmMessageCounts[chain.chainId] ?? 0;
            return (
              <tr
                key={chain.chainId}
                onClick={() => {
                  sessionStorage.setItem('dashboardScrollPosition', String(window.scrollY));
                  navigate(`/chain/${chain.chainId}`);
                }}
                className={`group cursor-pointer transition-colors hover:bg-[#ef4444]/[0.04] ${
                  idx !== chains.length - 1 ? 'border-b border-border/60' : ''
                }`}
              >
                <td className="py-3 pl-5">
                  <div className="flex items-center gap-3 min-w-0">
                    <ChainAvatar chain={chain} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-foreground truncate">
                        {chain.chainName}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-medium truncate">
                        {chain.networkToken?.symbol || chain.subnetId?.slice(0, 8) || chain.chainId.slice(0, 12)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-3 text-right tabular-nums text-[13px] font-medium text-foreground">
                  {formatTps(chain.tps?.value)}
                </td>
                <td className="py-3 text-right tabular-nums text-[13px] font-medium text-foreground">
                  {chain.validatorCount?.toLocaleString() ?? '—'}
                </td>
                <td className="py-3 text-right tabular-nums text-[13px] text-muted-foreground">
                  {chain.cumulativeTxCount?.value != null ? formatCount(chain.cumulativeTxCount.value) : '—'}
                </td>
                <td className="py-3 text-right tabular-nums text-[13px] text-muted-foreground">
                  {icm > 0 ? formatCount(icm) : '—'}
                </td>
                <td className="py-3 pr-5">
                  <div className="flex items-center justify-end gap-2">
                    <StatusPill active={chain.isActive ?? false} />
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
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

function ChainAvatar({ chain }: { chain: Chain }) {
  if (chain.chainLogoUri) {
    return (
      <img
        src={chain.chainLogoUri}
        alt=""
        className="w-7 h-7 rounded-full bg-muted shrink-0 object-cover"
        loading="lazy"
      />
    );
  }
  const initial = chain.chainName.charAt(0).toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-[#ef4444]/15 text-[#ef4444] flex items-center justify-center text-[11px] font-bold shrink-0">
      {initial}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 h-5 rounded-full ${
        active ? 'bg-green-500/10' : 'bg-muted'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-muted-foreground/60'}`} />
      <span
        className={`text-[10px] font-bold tracking-wider ${
          active ? 'text-green-500' : 'text-muted-foreground'
        }`}
      >
        {active ? 'ACTIVE' : 'INACTIVE'}
      </span>
    </div>
  );
}

function ScreenerPagination({
  currentPage,
  totalPages,
  totalRows,
  pageSize,
  onChange,
}: {
  currentPage: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalRows);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
    .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
      acc.push(p);
      return acc;
    }, []);
  return (
    <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-border">
      <span className="text-xs text-muted-foreground">
        {start}–{end} of {totalRows} L1s
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="px-2.5 h-7 text-xs border border-border rounded-md bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        {pages.map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`e-${idx}`} className="px-1 text-muted-foreground text-xs">
              …
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(item as number)}
              className={`px-2.5 h-7 text-xs border rounded-md transition-colors ${
                currentPage === item
                  ? 'bg-[#ef4444] border-[#ef4444] text-white'
                  : 'border-border bg-card hover:bg-muted'
              }`}
            >
              {item}
            </button>
          ),
        )}
        <button
          onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="px-2.5 h-7 text-xs border border-border rounded-md bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
