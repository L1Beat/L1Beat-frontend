// src/pages/ACPs.tsx
import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SEO } from '../components/SEO';
import { SegmentedControl, StatStrip } from '../components/instrument';
import { RefreshCw, Search, X } from 'lucide-react';
import { acpService } from '../services/acpService';
import type { EnhancedACP, ACPStats } from '../types';
import EnhancedACPCard from '../components/ACPCard';
import { AcpStatus, ComplexityDots } from '../components/acp/AcpStatus';


type ViewMode = 'list' | 'grid';
const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Cards' },
];
// Status tabs follow the ACP lifecycle; "Other" catches withdrawn, stale, drafts.
const STATUS_TABS = ['All', 'Proposed', 'Implementable', 'Activated', 'Other'] as const;
type StatusTab = (typeof STATUS_TABS)[number];
const MAIN_STATUSES = new Set(['Proposed', 'Implementable', 'Activated']);
const TRACKS = ['Standards Track', 'Best Practices Track', 'Meta Track', 'Subnet Track'];
const COMPLEXITIES = ['Low', 'Medium', 'High', 'Very High'];



type SortOption = 'number' | 'title' | 'status' | 'track';
type SortOrder = 'asc' | 'desc';

interface Filters {
  status: string;
  track: string;
  complexity: string;
  author: string;
  hasDiscussion?: boolean | null;
}

export default function ACPs() {
  const navigate = useNavigate();
  const [acps, setAcps] = useState<EnhancedACP[]>([]);
  const [stats, setStats] = useState<ACPStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusTab, setStatusTab] = useState<StatusTab>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy] = useState<SortOption>('number');
  const [sortOrder] = useState<SortOrder>('desc');

  // Filters
  const [filters, setFilters] = useState<Filters>({
    status: '',
    track: '',
    complexity: '',
    author: '',

  });

  useEffect(() => {
    let mounted = true;
    
    async function fetchData() {
      if (!mounted) return;
      
      try {
        setLoading(true);
        setError(null);

        console.log('Loading ACPs from local data...');
        const acpsData = await acpService.loadACPs();

        if (!mounted) return;

        if (acpsData.length === 0) {
          throw new Error('No ACPs found. Make sure the submodule is initialized and the build script has been run.');
        }
        setAcps(acpsData);
        setStats(calculateStats(acpsData));
        setError(null);
      } catch (err) {
        if (!mounted) return;
        console.error('Error loading ACPs:', err);
        setError(err instanceof Error ? err.message : 'Failed to load ACPs');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchData();
    
    return () => {
      mounted = false;
    };
  }, []);

  const getCleanStatus = (status: string) => {
    if (!status) return 'Unknown';
    // Extracts the primary status from a detailed string.
    // e.g., "Proposed (Last Call - Final Comments)" -> "Proposed"
    // e.g., "Active [ACPs.md]" -> "Active"
    const match = status.match(/^[a-zA-Z]+/);
    return match ? match[0] : 'Unknown';
  };

    function calculateStats(acps: EnhancedACP[]): ACPStats {
  // These optional ACPStats fields are all initialized below and mutated in the
  // loop, so require them locally to keep index writes and increments well-typed.
  const stats: ACPStats &
    Required<Pick<ACPStats, 'byCategory' | 'byImpact' | 'implementationProgress' | 'recentlyUpdated' | 'needsAttention'>> = {
    total: acps.length,
    byStatus: {},
    byTrack: {},
    byComplexity: {},
    byCategory: {},
    byImpact: {},
    averageReadingTime: 0,
    totalAuthors: 0,
    implementationProgress: {
      notStarted: 0,
      inProgress: 0,
      completed: 0,
      deployed: 0,
    },
    recentlyUpdated: 0,
    needsAttention: 0,
  };

  const uniqueAuthors = new Set<string>();
  let totalReadingTime = 0;

  acps.forEach((acp) => {
    // Status - now using clean status directly
    const cleanStatus = getCleanStatus(acp.status); // Keep as safety measure
    stats.byStatus[cleanStatus] = (stats.byStatus[cleanStatus] || 0) + 1;
    
    // Track
    stats.byTrack[acp.track] = (stats.byTrack[acp.track] || 0) + 1;
    
    // Rest remains the same...
    if (acp.complexity) {
      stats.byComplexity[acp.complexity] = (stats.byComplexity[acp.complexity] || 0) + 1;
    }
    
    if (acp.category) {
      stats.byCategory[acp.category] = (stats.byCategory[acp.category] || 0) + 1;
    }
    
    if (acp.impact) {
      stats.byImpact[acp.impact] = (stats.byImpact[acp.impact] || 0) + 1;
    }
    
    acp.authors.forEach(author => uniqueAuthors.add(author.name));
    totalReadingTime += (acp.readingTime || 0);
    
    const implStatus = acp.implementationStatus || 'not-started';
    if (implStatus === 'not-started') stats.implementationProgress.notStarted++;
    else if (implStatus === 'in-progress') stats.implementationProgress.inProgress++;
    else if (implStatus === 'completed') stats.implementationProgress.completed++;
    else if (implStatus === 'deployed') stats.implementationProgress.deployed++;
    
    if (acp.updated) {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      if (new Date(acp.updated).getTime() > thirtyDaysAgo) {
        stats.recentlyUpdated++;
      }
    }
    
    // Update this to use clean status
    if (['Stale', 'Withdrawn'].includes(cleanStatus)) {
      stats.needsAttention++;
    }
  });

  stats.totalAuthors = uniqueAuthors.size;
  stats.averageReadingTime = acps.length > 0 ? totalReadingTime / acps.length : 0;
  
  return stats;
}


  // Filter and sort ACPs
  const filteredAndSortedACPs = useMemo(() => {
    let filtered = acps.filter(acp => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          acp.title.toLowerCase().includes(query) ||
          acp.number.includes(query) ||
          `acp${acp.number}`.toLowerCase().includes(query) ||
          `acp-${acp.number}`.toLowerCase().includes(query) ||
          acp.authors?.some(author => author.name.toLowerCase().includes(query)) ||
          acp.abstract?.toLowerCase().includes(query);
        
        if (!matchesSearch) return false;
      }

      // Status tab, then the explicit status filter if one is set
      const clean = getCleanStatus(acp.status);
      if (statusTab === 'Other' ? MAIN_STATUSES.has(clean) : statusTab !== 'All' && clean !== statusTab) return false;
      if (filters.status && clean !== filters.status) return false;

      // Track filter
      if (filters.track && acp.track !== filters.track) return false;

      // Complexity filter
      if (filters.complexity && acp.complexity !== filters.complexity) return false;

      // Author filter
      if (filters.author) {
        const authorMatch = acp.authors?.some(author => 
          author.name.toLowerCase().includes(filters.author.toLowerCase())
        );
        if (!authorMatch) return false;
      }

      

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'number':
          comparison = Number(a.number) - Number(b.number);
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        case 'track':
          comparison = (a.track || '').localeCompare(b.track || '');
          break;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [acps, searchQuery, filters, sortBy, sortOrder, statusTab]);

  const tabCounts = useMemo(() => {
    const counts: Record<StatusTab, number> = { All: acps.length, Proposed: 0, Implementable: 0, Activated: 0, Other: 0 };
    for (const acp of acps) {
      const clean = getCleanStatus(acp.status);
      if (MAIN_STATUSES.has(clean)) counts[clean as StatusTab]++;
      else counts.Other++;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acps]);
  const activeFilterCount = Object.values(filters).filter((f) => f !== '' && f != null).length;

  const clearFilters = () => {
    setFilters({
      status: '',
      track: '',
      complexity: '',
      author: '',
    });
    setSearchQuery('');
    setStatusTab('All');
  };

  // Rendered in the loading state too: the SSG build only sees that state.
  const seo = (
    <SEO
      title="Avalanche Community Proposals"
      description="Browse, filter, and track every ACP (Avalanche Community Proposals) from draft through final, with status, track, and authors."
      url="/acps"
    />
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        {seo}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <h2 className="text-lg font-semibold text-foreground mt-4 mb-2">
              Loading ACPs...
            </h2>
            <p className="text-muted-foreground">
              Processing Avalanche Community Proposals
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <h2 className="text-[15px] font-semibold text-foreground mb-1">Couldn't load the ACPs</h2>
            <p className="text-[12px] text-muted-foreground mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 h-7 px-3 text-[12px] font-medium rounded bg-foreground text-background hover:bg-foreground/90"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {seo}
      <div className="flex-1">
        <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-4">
          {/* Header */}
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-[18px] leading-6 font-semibold text-foreground">
                Avalanche Community Proposals
              </h1>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                Every ACP from draft to activation, with status, track, and authors.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 border border-border rounded text-[12px] font-medium text-foreground bg-background hover:bg-accent transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>
          </div>

          {/* Statistics */}
          {stats && (
            <div>
              <StatStrip
                items={[
                  { label: 'Total ACPs', value: String(stats.total), sub: 'tracked proposals' },
                  { label: 'Contributors', value: String(stats.totalAuthors || 0), sub: 'distinct authors' },
                  { label: 'Deployed', value: String(stats.implementationProgress?.deployed || 0), sub: 'activated on mainnet' },
                  { label: 'Recently updated', value: String(stats.recentlyUpdated || 0), sub: 'changed in the last 30 days' },
                ]}
              />
            </div>
          )}

          {/* Toolbar: status tabs, search, track and complexity, view */}
          <section id="acps" className="scroll-mt-12">
            <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4 py-2">
              <nav className="flex items-center gap-0.5 -ml-2.5 overflow-x-auto no-scrollbar" aria-label="Status">
                {STATUS_TABS.map((t) => {
                  const active = t === statusTab;
                  return (
                    <button
                      key={t}
                      onClick={() => setStatusTab(t)}
                      className={`flex items-baseline gap-1.5 h-8 px-2.5 rounded whitespace-nowrap transition-colors ${
                        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="text-[12.5px] font-medium">{t}</span>
                      <span className="num text-[11px] text-muted-foreground">{tabCounts[t]}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="hidden lg:block w-px h-5 bg-border" aria-hidden />
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by number, title, or author"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-8 pl-8 pr-8 rounded bg-background border border-border text-[12px] placeholder:text-muted-foreground focus:outline-none focus:border-foreground/40"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <select
                value={filters.track}
                onChange={(e) => setFilters({ ...filters, track: e.target.value })}
                aria-label="Track"
                className="h-8 px-2 rounded border border-border bg-background text-[12px] text-foreground focus:outline-none focus:border-foreground/40"
              >
                <option value="">All tracks</option>
                {TRACKS.map((t) => (
                  <option key={t} value={t}>{t.replace(' Track', '')}</option>
                ))}
              </select>
              <select
                value={filters.complexity}
                onChange={(e) => setFilters({ ...filters, complexity: e.target.value })}
                aria-label="Complexity"
                className="h-8 px-2 rounded border border-border bg-background text-[12px] text-foreground focus:outline-none focus:border-foreground/40"
              >
                <option value="">Any complexity</option>
                {COMPLEXITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {(activeFilterCount > 0 || searchQuery || statusTab !== 'All') && (
                <button onClick={clearFilters} className="inline-flex items-center gap-1 h-8 px-2 rounded text-[12px] text-muted-foreground hover:text-foreground">
                  Clear
                  <X className="w-3 h-3" />
                </button>
              )}
              <div className="flex-1" />
              <span className="num text-[11px] text-muted-foreground hidden sm:inline">
                {filteredAndSortedACPs.length} of {acps.length}
              </span>
              <SegmentedControl value={viewMode} options={VIEW_OPTIONS} onChange={setViewMode} ariaLabel="View" />
            </div>

            {filteredAndSortedACPs.length === 0 ? (
              <div className="border-y border-border px-6 py-12 text-center text-[12px] text-muted-foreground">
                No ACPs match. Clear the search or pick another status.
              </div>
            ) : viewMode === 'list' ? (
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-[12px]">
                  <thead className="bg-background">
                    <tr className="h-9 border-b border-border text-[11px] font-medium text-muted-foreground">
                      <th className="text-left font-medium w-20 num">ACP</th>
                      <th className="text-left font-medium">Title</th>
                      <th className="text-left font-medium w-32">Status</th>
                      <th className="text-left font-medium w-32 hidden lg:table-cell">Track</th>
                      <th className="text-left font-medium w-24 hidden md:table-cell">Complexity</th>
                      <th className="text-left font-medium hidden xl:table-cell">Authors</th>
                      <th className="text-right font-medium w-16 hidden md:table-cell">Read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedACPs.map((acp) => {
                      const authors = acp.authors?.map((a) => a.name).filter(Boolean) ?? [];
                      return (
                        <tr
                          key={acp.number}
                          onClick={() => navigate(`/acps/${acp.number}`)}
                          className="h-10 cursor-pointer border-b border-border/50 hover:bg-accent/40 transition-colors"
                        >
                          <td className="num text-[12px] text-muted-foreground pr-3">{acp.number}</td>
                          <td className="pr-4">
                            <span className="text-[12.5px] font-medium text-foreground line-clamp-1">{acp.title}</span>
                          </td>
                          <td>
                            <AcpStatus status={acp.status} />
                          </td>
                          <td className="text-[11px] text-muted-foreground hidden lg:table-cell">{(acp.track || '').replace(' Track', '') || '—'}</td>
                          <td className="hidden md:table-cell"><ComplexityDots level={acp.complexity} /></td>
                          <td className="text-[11px] text-muted-foreground hidden xl:table-cell">
                            <span className="line-clamp-1">
                              {authors.length === 0 ? '—' : authors.length <= 2 ? authors.join(', ') : `${authors[0]}, ${authors[1]} +${authors.length - 2}`}
                            </span>
                          </td>
                          <td className="num text-[11px] text-muted-foreground text-right hidden md:table-cell">
                            {acp.readingTime ? `${acp.readingTime} min` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                {filteredAndSortedACPs.map((acp) => (
                  <EnhancedACPCard key={acp.number} acp={acp} onClick={(a) => navigate(`/acps/${a.number}`)} />
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}

// export default ACPs;