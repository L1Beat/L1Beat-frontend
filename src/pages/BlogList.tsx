import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { BlogPost, BlogTag, formatBlogDate, getBlogPosts, getBlogTags } from '../api/blogApi';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SEO } from '../components/SEO';
import { getBlogPostImageUrl } from '../utils/imageExtractor';

function authorsOf(post: BlogPost): string[] {
  if (post.authors && post.authors.length > 0) return post.authors;
  if (post.authorProfiles && post.authorProfiles.length > 0) return post.authorProfiles.map((p) => p.name);
  return post.author ? [post.author] : [];
}

function joinNames(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

const POSTS_PER_PAGE = 12;

export function BlogList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const selectedTag = searchParams.get('tag');

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


  const filteredPosts = posts;
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

  // Rendered in the loading state too: the SSG build only sees that state.
  const seo = (
    <SEO
      title="Blog"
      description="Insights, research, and deep-dives on Avalanche L1s: performance, economics, and the people building them."
      url="/blog"
    />
  );

  if (loading && posts.length === 0) {
    return (
      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-12 flex items-center justify-center">
        {seo}
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-muted-foreground">Loading articles…</p>
        </div>
      </div>
    );
  }

  const hasFilters = Boolean(selectedTag);

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 space-y-4">
      {seo}
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[18px] leading-6 font-semibold text-foreground">Research and notes</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Validator economics, cross-chain messaging, and the long arc of L1 adoption.
          </p>
        </div>
        {latestUpdate && (
          <span className="hidden sm:inline text-[11px] text-muted-foreground">
            <span className="num">{posts.length}</span> {posts.length === 1 ? 'article' : 'articles'}, updated {formatRelative(latestUpdate)}
          </span>
        )}
      </header>

      {/* Toolbar: topic tabs. Full-text search lives in the global ⌘K palette. */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4 py-2">
        <nav className="flex items-center gap-0.5 -ml-2.5 overflow-x-auto no-scrollbar" aria-label="Topics">
          <TopicTab label="All" count={posts.length} active={!selectedTag} onClick={() => handleTagFilter(null)} />
          {tags.map((tag) => (
            <TopicTab key={tag.name} label={tag.name} count={tag.count} active={selectedTag === tag.name} onClick={() => handleTagFilter(tag.name)} />
          ))}
        </nav>
      </div>

      {error && (
        <div className="border-y border-border py-3 flex items-center gap-3 text-[12px]">
          <span className="text-muted-foreground">{error}</span>
          <button onClick={() => window.location.reload()} className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-foreground hover:underline">
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        </div>
      )}

      {filteredPosts.length === 0 ? (
        <div className="border-y border-border px-6 py-12 text-center text-[12px] text-muted-foreground">
          {hasFilters ? 'No articles on this topic yet.' : 'No articles yet.'}
        </div>
      ) : (
        <div className="border-t border-border">
          {/* Lead: the newest article, with its image. */}
          {featuredPost && !hasFilters && <LeadArticle post={featuredPost} />}

          {/* Index: every other article as a dated row. */}
          {(hasFilters ? filteredPosts : regularPosts).map((post) => (
            <ArticleRow key={post._id} post={post} />
          ))}
        </div>
      )}

      {hasMore && filteredPosts.length > 0 && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 h-8 px-3 rounded border border-border bg-background text-[12px] font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingMore ? 'animate-spin' : ''}`} />
            {loadingMore ? 'Loading' : 'Load more articles'}
          </button>
        </div>
      )}
    </div>
  );
}

function TopicTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-baseline gap-1.5 h-8 px-2.5 rounded whitespace-nowrap transition-colors ${
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className="text-[12.5px] font-medium">{label}</span>
      <span className="num text-[11px] text-muted-foreground">{count}</span>
    </button>
  );
}

function LeadArticle({ post }: { post: BlogPost }) {
  const imageUrl = getBlogPostImageUrl(post);
  const authors = joinNames(authorsOf(post));
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group grid grid-cols-1 lg:grid-cols-12 gap-6 py-6 border-b border-border hover:bg-accent/30 -mx-4 px-4 transition-colors"
    >
      <div className="lg:col-span-5 flex flex-col justify-center min-w-0">
        <div className="num text-[11px] text-muted-foreground">
          {formatBlogDate(post.publishedAt)}
          {post.readTime ? ` · ${post.readTime} min read` : ''}
        </div>
        <h2 className="mt-2 text-[22px] sm:text-[26px] leading-tight font-semibold text-foreground">{post.title}</h2>
        {post.excerpt && <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground line-clamp-3">{post.excerpt}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          {authors && <span className="text-foreground">{authors}</span>}
          {post.tags?.slice(0, 3).map((t) => (
            <span key={t} className="text-muted-foreground">{t}</span>
          ))}
        </div>
      </div>
      {imageUrl && (
        <div className="lg:col-span-7">
          <img src={imageUrl} alt="" className="w-full aspect-[16/9] object-cover rounded-md bg-muted" loading="lazy" />
        </div>
      )}
    </Link>
  );
}

function ArticleRow({ post }: { post: BlogPost }) {
  const imageUrl = getBlogPostImageUrl(post);
  const authors = joinNames(authorsOf(post));
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex items-center gap-5 py-4 border-b border-border hover:bg-accent/30 -mx-4 px-4 transition-colors"
    >
      <div className="num w-28 shrink-0 text-[11px] text-muted-foreground">{formatBlogDate(post.publishedAt)}</div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-medium text-foreground leading-snug line-clamp-2">{post.title}</h3>
        {post.excerpt && <p className="mt-1 text-[12px] text-muted-foreground line-clamp-1 hidden sm:block">{post.excerpt}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          {authors && <span className="text-foreground/80">{authors}</span>}
          {post.readTime ? <span className="num">{post.readTime} min read</span> : null}
          {post.tags?.slice(0, 2).map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
      {imageUrl && (
        <img src={imageUrl} alt="" className="hidden md:block w-32 h-20 object-cover rounded bg-muted shrink-0" loading="lazy" />
      )}
    </Link>
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




