import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, RefreshCw, Search, X } from 'lucide-react';
import { BlogPost, BlogTag, getBlogPosts, getBlogTags } from '../api/blogApi';
import { BlogCard } from '../components/BlogCard';
import { LoadingSpinner } from '../components/LoadingSpinner';

const POSTS_PER_PAGE = 12;

export function BlogList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);

  const selectedTag = searchParams.get('tag');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [postsRes, tagsRes] = await Promise.all([
          getBlogPosts(POSTS_PER_PAGE, 0, selectedTag || undefined),
          getBlogTags(),
        ]);
        if (!active) return;
        setPosts(postsRes.data);
        setHasMore(postsRes.metadata.hasMore);
        setTags(tagsRes.data);
      } catch (err) {
        if (!active) return;
        console.error('Error loading blog data:', err);
        setError('Failed to load articles. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [selectedTag]);

  const handleTagFilter = (tag: string | null) => {
    if (tag) setSearchParams({ tag });
    else setSearchParams({});
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await getBlogPosts(POSTS_PER_PAGE, posts.length, selectedTag || undefined);
      setPosts((prev) => [...prev, ...res.data]);
      setHasMore(res.metadata.hasMore);
    } catch (err) {
      console.error('Error loading more posts:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredPosts = useMemo(() => {
    if (!debouncedSearch.trim()) return posts;
    const term = debouncedSearch.toLowerCase();
    return posts.filter((p) => {
      return (
        p.title.toLowerCase().includes(term) ||
        p.excerpt.toLowerCase().includes(term) ||
        p.author?.toLowerCase().includes(term) ||
        p.tags.some((t) => t.toLowerCase().includes(term))
      );
    });
  }, [posts, debouncedSearch]);

  const featuredPost = filteredPosts[0];
  const regularPosts = filteredPosts.slice(1);
  const latestUpdate = useMemo(() => {
    if (posts.length === 0) return null;
    const newest = posts.reduce((latest, p) => {
      const lt = latest ? new Date(latest.publishedAt).getTime() : 0;
      const pt = new Date(p.publishedAt).getTime();
      return pt > lt ? p : latest;
    }, null as BlogPost | null);
    return newest?.publishedAt ?? null;
  }, [posts]);

  if (loading && posts.length === 0) {
    return (
      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-12 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-muted-foreground">Loading articles…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <Hero
        totalArticles={posts.length}
        latestUpdate={latestUpdate}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        resultCount={filteredPosts.length}
        showResultCount={Boolean(debouncedSearch)}
      />

      {tags.length > 0 && (
        <TagFilter
          tags={tags}
          selectedTag={selectedTag}
          onSelect={handleTagFilter}
          totalPosts={posts.length}
        />
      )}

      {error && (
        <div className="rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/10 px-4 py-3 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-[#ef4444]" />
          <span className="text-sm text-[#ef4444]">{error}</span>
          <button
            onClick={() => window.location.reload()}
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-[#ef4444] hover:text-[#dc2626]"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {filteredPosts.length === 0 ? (
          <EmptyState
            searchTerm={debouncedSearch}
            selectedTag={selectedTag}
            onClear={() => {
              setSearchTerm('');
              handleTagFilter(null);
            }}
          />
        ) : (
          <motion.div
            key={`${selectedTag || 'all'}-${debouncedSearch}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {featuredPost && <BlogCard post={featuredPost} featured />}

            {regularPosts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {regularPosts.map((post) => (
                  <BlogCard key={post._id} post={post} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {hasMore && filteredPosts.length > 0 && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-card border border-border text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingMore ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading…
              </>
            ) : (
              'Load more articles'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function Hero({
  totalArticles,
  latestUpdate,
  searchTerm,
  onSearchChange,
  resultCount,
  showResultCount,
}: {
  totalArticles: number;
  latestUpdate: string | null;
  searchTerm: string;
  onSearchChange: (v: string) => void;
  resultCount: number;
  showResultCount: boolean;
}) {
  const meta: string[] = [];
  if (totalArticles > 0) {
    meta.push(`${totalArticles} ${totalArticles === 1 ? 'article' : 'articles'}`);
  }
  if (latestUpdate) {
    meta.push(`Updated ${formatRelative(latestUpdate)}`);
  }

  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="text-[11px] font-bold tracking-[0.15em] text-[#ef4444] mb-1.5">
          L1BEAT INSIGHTS
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          Avalanche L1s, explained.
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Field notes on validator economics, cross-chain messaging, and the long arc of L1
          adoption.
        </p>
        {meta.length > 0 && (
          <div className="text-xs text-muted-foreground mt-3">{meta.join(' · ')}</div>
        )}
      </div>
      <div className="lg:w-80 shrink-0 flex flex-col gap-1.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search articles…"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-10 pl-9 pr-9 rounded-lg bg-card border border-border text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#ef4444]/30 focus:border-[#ef4444]/40"
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
        {showResultCount && (
          <div className="text-[11px] text-muted-foreground pl-1">
            {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </div>
        )}
      </div>
    </header>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then) return '';
  const diff = Date.now() - then;
  const day = 1000 * 60 * 60 * 24;
  const days = Math.floor(diff / day);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function TagFilter({
  tags,
  selectedTag,
  onSelect,
  totalPosts,
}: {
  tags: BlogTag[];
  selectedTag: string | null;
  onSelect: (tag: string | null) => void;
  totalPosts: number;
}) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
      <FilterChip
        label="All"
        count={totalPosts}
        active={!selectedTag}
        onClick={() => onSelect(null)}
      />
      {tags.map((tag) => (
        <FilterChip
          key={tag.name}
          label={tag.name}
          count={tag.count}
          active={selectedTag === tag.name}
          onClick={() => onSelect(tag.name)}
        />
      ))}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ${
        active
          ? 'bg-[#ef4444]/15 border-[#ef4444]/30 text-[#ef4444]'
          : 'bg-card border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
      <span
        className={`text-[10px] font-bold px-1.5 h-4 inline-flex items-center rounded-full ${
          active ? 'bg-[#ef4444] text-white' : 'bg-muted text-muted-foreground'
        }`}
      >
        {count}
      </span>
    </button>
  );
}


function EmptyState({
  searchTerm,
  selectedTag,
  onClear,
}: {
  searchTerm: string;
  selectedTag: string | null;
  onClear: () => void;
}) {
  const hasFilters = Boolean(searchTerm || selectedTag);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="rounded-2xl border border-border bg-card px-6 py-12 text-center"
    >
      <h3 className="text-base font-semibold text-foreground mb-2">
        {hasFilters ? 'No articles match these filters' : 'No articles yet'}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {hasFilters
          ? 'Try different keywords or browse by topic.'
          : 'Check back soon for fresh insights from the Avalanche ecosystem.'}
      </p>
      {hasFilters && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#ef4444] text-white text-sm font-semibold hover:bg-[#dc2626] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Clear filters
        </button>
      )}
    </motion.div>
  );
}
