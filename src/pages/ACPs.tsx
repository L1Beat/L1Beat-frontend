// src/pages/ACPs.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar } from '../components/StatusBar';
import { Footer } from '../components/Footer';
import {
  FileText,
  ExternalLink,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Search,
  Filter,
  Grid,
  List,
  TrendingUp,
  Users,
  Tag,
  BookOpen,
  ChevronDown,
  Star,
  Archive,
  Code,
  AlertCircle
} from 'lucide-react';
import { getHealth } from '../api';
import { acpService, LocalACP, EnhancedACP, ACPStats } from '../services/acpService';
import EnhancedACPCard from '../components/ACPCard';


type ViewMode = 'grid' | 'list';
type SortOption = 'number' | 'title' | 'status' | 'track';
type SortOrder = 'asc' | 'desc';

interface Filters {
  status: string;
  track: string;
  complexity: string;
  author: string;
}

export default function ACPs() {
  const navigate = useNavigate();
  const [acps, setAcps] = useState<LocalACP[]>([]);
  const [stats, setStats] = useState<ACPStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('number');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filters, setFilters] = useState<Filters>({
    status: '',
    track: '',
    complexity: '',
    author: '',

  });

  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    
    async function fetchData() {
      if (!mounted) return;
      
      try {
        setLoading(true);
        setError(null);

        console.log('Loading ACPs from local data...');
        const [acpsData, healthData] = await Promise.all([
          acpService.loadACPs(),
          getHealth(),
        ]);
        
        if (!mounted) return;
        
        if (acpsData.length === 0) {
          throw new Error('No ACPs found. Make sure the submodule is initialized and the build script has been run.');
        }
        setAcps(acpsData);
        setStats(calculateStats(acpsData));
        setHealth(healthData);
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
  const stats: ACPStats = {
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

      // Status filter
      if (filters.status && getCleanStatus(acp.status) !== filters.status) return false;

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
  }, [acps, searchQuery, filters, sortBy, sortOrder]);

  const getStatusIcon = (status: string) => {
    const cleanStatus = getCleanStatus(status); 
    switch (cleanStatus?.toLowerCase()) {
      case 'final':
      case 'active':
      case 'activated':
        return <CheckCircle className="w-4 h-4 text-white" />;
      case 'draft':
      case 'proposed':
        return <Clock className="w-4 h-4 text-white" />;
      case 'review':
        return <AlertCircle className="w-4 h-4 text-white" />;
      case 'withdrawn':
      case 'rejected':
      case 'stagnant':
      case 'stale':
        return <XCircle className="w-4 h-4 text-white" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-white" />;
    }
  };

  const getStatusColor = (status: string) => {
    const cleanStatus = getCleanStatus(status);
    switch (cleanStatus?.toLowerCase()) {
      case 'final':
      case 'active':
      case 'activated':
        return 'bg-green-500 text-white';
      case 'draft':
      case 'proposed':
        return 'bg-blue-500 text-white';
      case 'review':
        return 'bg-yellow-500 text-white';
      case 'withdrawn':
      case 'rejected':
      case 'stagnant':
      case 'stale':
        return 'bg-gray-500 text-white';
      default:
        return 'bg-gray-400 text-white';
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity) {
      case 'Low':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-400';
      case 'High':
        return 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-500/20 dark:text-gray-400';
    }
  };

  const clearFilters = () => {
    setFilters({
      status: '',
      track: '',
      complexity: '',
      author: '',

    });
    setSearchQuery('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex flex-col">
        <StatusBar health={health} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Loading ACPs...
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Processing Avalanche Community Proposals
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex flex-col">
        <StatusBar health={health} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Failed to Load ACPs
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {error}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex flex-col">
      <StatusBar health={health} />

      <div className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Avalanche Community Proposals
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-300">
                Browse and explore all ACPs in the Avalanche ecosystem
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </button>
            </div>
          </div>

          {/* Statistics Cards */}
          {stats && (
            <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {stats.total}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total ACPs</div>
                  </div>
                  <FileText className="w-8 h-8 text-blue-500 opacity-50" />
                </div>
              </div>
              
              <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {stats.totalAuthors || 0}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Contributors</div>
                  </div>
                  <Users className="w-8 h-8 text-green-500 opacity-50" />
                </div>
              </div>
              
              <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {stats.implementationProgress?.deployed || 0}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Deployed</div>
                  </div>
                  <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
                </div>
              </div>
              
              <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {stats.recentlyUpdated || 0}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Recently Updated</div>
                  </div>
                  <TrendingUp className="w-8 h-8 text-yellow-500 opacity-50" />
                </div>
              </div>
            </div>
          )}

          {/* Controls Bar */}
          <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              {/* Search Bar */}
              <div className="flex-1 max-w-xl">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search ACPs by number, title, or author..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-dark-700 dark:text-white"
                  />
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                {/* Filter Button */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`inline-flex items-center px-4 py-2 border rounded-md text-sm font-medium transition-colors ${
                    showFilters
                      ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-700 hover:bg-gray-50 dark:hover:bg-dark-600'
                  }`}
                >
                  <Filter className="w-4 h-4 mr-2" />
                  Filters
                  {Object.values(filters).filter(f => f !== '' && f !== null).length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs bg-blue-500 text-white rounded-full">
                      {Object.values(filters).filter(f => f !== '' && f !== null).length}
                    </span>
                  )}
                </button>

                {/* View Mode Toggle */}
                <div className="flex items-center bg-gray-100 dark:bg-dark-700 rounded-md p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded ${
                      viewMode === 'grid'
                        ? 'bg-white dark:bg-dark-600 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <Grid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded ${
                      viewMode === 'list'
                        ? 'bg-white dark:bg-dark-600 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Filters Panel */}
            {showFilters && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {/* Status Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Status
                    </label>
                    <select
                      value={filters.status}
                      onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-dark-700 dark:text-white"
                    >
                      <option value="">All</option>
                      <option value="Draft">Draft</option>
                      <option value="Review">Review</option>
                      <option value="Proposed">Proposed</option>
                      <option value="Implementable">Implementable</option>
                      <option value="Activated">Activated</option>
                      <option value="Stale">Stale</option>
                      <option value="Withdrawn">Withdrawn</option>
                    </select>
                  </div>

                  {/* Track Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Track
                    </label>
                    <select
                      value={filters.track}
                      onChange={(e) => setFilters({ ...filters, track: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-dark-700 dark:text-white"
                    >
                      <option value="">All</option>
                      <option value="Standards Track">Standards Track</option>
                      <option value="Best Practices Track">Best Practices</option>
                      <option value="Meta Track">Meta Track</option>
                      <option value="Subnet Track">Subnet Track</option>
                    </select>
                  </div>

                  {/* Complexity Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Complexity
                    </label>
                    <select
                      value={filters.complexity}
                      onChange={(e) => setFilters({ ...filters, complexity: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-dark-700 dark:text-white"
                    >
                      <option value="">All</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Very High">Very High</option>
                    </select>
                  </div>

                  {/* Author Filter */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Author
                    </label>
                    <input
                      type="text"
                      value={filters.author}
                      onChange={(e) => setFilters({ ...filters, author: e.target.value })}
                      placeholder="Filter by author..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm dark:bg-dark-700 dark:text-white"
                    />
                  </div>

                  

                  {/* Clear Filters */}
                  <div className="flex items-end">
                    <button
                      onClick={() => setFilters({
                        status: '',
                        track: '',
                        complexity: '',
                        author: '',
                        hasDiscussion: null
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-700 hover:bg-gray-50 dark:hover:bg-dark-600"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results Count */}
          <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Showing {filteredAndSortedACPs.length} of {acps.length} ACPs
          </div>

          {/* ACPs Grid/List */}
          {filteredAndSortedACPs.length === 0 ? (
            <div className="text-center py-12">
              <Archive className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No ACPs found
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                Try adjusting your search or filters
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAndSortedACPs.map((acp) => (
                <EnhancedACPCard
                  key={acp.number}
                  acp={acp}
                  viewMode="grid"
                  onClick={(acp) => navigate(`/acps/${acp.number}`)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAndSortedACPs.map((acp) => (
                <EnhancedACPCard
                  key={acp.number}
                  acp={acp}
                  viewMode="list"
                  onClick={(acp) => navigate(`/acps/${acp.number}`)}
                />
              ))}
            </div>
          )}

          {/* Load More / Pagination (if needed) */}
          {filteredAndSortedACPs.length > 0 && filteredAndSortedACPs.length < acps.length && (
            <div className="mt-8 text-center">
              <button className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                Load More
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}

// export default ACPs;