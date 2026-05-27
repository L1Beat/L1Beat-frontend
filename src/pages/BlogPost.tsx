import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import parse, { Element } from 'html-react-parser';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  List,
  Mail,
  RefreshCw,
} from 'lucide-react';
import {
  BlogPost as BlogPostType,
  calculateReadTime,
  formatBlogDate,
  getBlogPost,
  getRelatedPosts,
  RelatedPost,
} from '../api/blogApi';
import { getBlogPostImageUrl } from '../utils/imageExtractor';
import { AuthorCard, AuthorProfile } from '../components/AuthorCard';
import ContentRenderer from '../components/ContentRenderer';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SEO } from '../components/SEO';

interface TocItem {
  id: string;
  title: string;
  level: 2 | 3;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function findProfile(
  name: string,
  profiles?: AuthorProfile[],
): AuthorProfile | undefined {
  if (!profiles || profiles.length === 0) return undefined;
  const n = name.toLowerCase();
  return (
    profiles.find((p) => p.name.toLowerCase() === n) ||
    profiles.find((p) => p.name.toLowerCase().includes(n))
  );
}

declare global {
  interface Window {
    prerenderReady?: boolean;
  }
}

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPostType | null>(null);
  const [related, setRelated] = useState<RelatedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState<string>('');
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) {
      navigate('/blog');
      return;
    }
    window.prerenderReady = false;
    fetchPost();
  }, [slug, navigate]);

  useEffect(() => {
    if (!loading && (post || error)) {
      const timer = setTimeout(() => {
        window.prerenderReady = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, post, error]);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    getRelatedPosts(slug, 3)
      .then((res) => {
        if (active) setRelated(res.data || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!post) return;
    const root = contentRef.current;
    if (!root) return;

    const walk = () => {
      const headings = root.querySelectorAll<HTMLHeadingElement>('h2, h3');
      const items: TocItem[] = [];
      const seen = new Set<string>();
      headings.forEach((h) => {
        const text = (h.textContent || '').trim();
        if (!text) return;
        let id = slugify(text);
        if (!id) return;
        let n = 2;
        const base = id;
        while (seen.has(id)) id = `${base}-${n++}`;
        seen.add(id);
        h.id = id;
        h.classList.add('scroll-mt-24');
        items.push({ id, title: text, level: h.tagName === 'H3' ? 3 : 2 });
      });
      setTocItems((prev) => {
        if (prev.length === items.length && prev.every((p, i) => p.id === items[i].id)) {
          return prev;
        }
        return items;
      });
    };

    walk();
    const observer = new MutationObserver(walk);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    const stop = setTimeout(() => observer.disconnect(), 4000);

    return () => {
      observer.disconnect();
      clearTimeout(stop);
    };
  }, [post]);

  useEffect(() => {
    if (tocItems.length === 0) return;
    const TOP_OFFSET = 96;
    const update = () => {
      let active = tocItems[0]?.id || '';
      for (const item of tocItems) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - TOP_OFFSET <= 0) {
          active = item.id;
        } else {
          break;
        }
      }
      setActiveTocId(active);
    };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [tocItems]);

  const fetchPost = async () => {
    if (!slug) return;
    try {
      setLoading(true);
      setError(null);
      const response = await getBlogPost(slug);
      setPost(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message === 'Blog post not found') setError('Post not found');
      else setError('Failed to load blog post. Please try again.');
      console.error('Error fetching post:', err);
    } finally {
      setLoading(false);
    }
  };

  const sharePost = () => {
    if (!post) return;
    const url = window.location.href;
    const text = post.title;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank',
    );
  };

  if (loading) {
    return (
      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-12 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-muted-foreground">Loading article…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-[#ef4444]/15 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-[#ef4444]" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {error === 'Post not found' ? 'Article not found' : 'Something went wrong'}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {error === 'Post not found'
            ? "The article you're looking for doesn't exist or has been moved."
            : error}
        </p>
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => navigate('/blog')}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#ef4444] text-white text-sm font-semibold hover:bg-[#dc2626] transition-colors"
          >
            Back to Blog
          </button>
          {error !== 'Post not found' && (
            <button
              onClick={fetchPost}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-card border border-border text-sm font-semibold text-foreground hover:bg-accent transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!post) return null;

  const readTime = post.readTime || calculateReadTime(post.content || '');
  const formattedDate = formatBlogDate(post.publishedAt || '');
  const seoImage = getBlogPostImageUrl(post);

  let authorsList: string[] = [];
  if (post.authors && post.authors.length > 0) authorsList = post.authors;
  else if (post.authorProfiles && post.authorProfiles.length > 0)
    authorsList = post.authorProfiles.map((p) => p.name);
  else if (post.author) authorsList = [post.author];

  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <SEO
        title={post.title}
        description={post.excerpt || post.subtitle || ''}
        image={seoImage}
        url={`/blog/${post.slug}`}
        type="article"
        publishedTime={post.publishedAt}
        modifiedTime={post.updatedAt}
        author={post.author}
        tags={post.tags}
      />

      <Link
        to="/blog"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-5"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All articles
      </Link>

      <div className="lg:flex lg:gap-10 lg:items-start">
        <article className="flex-1 min-w-0 space-y-6">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-[#ef4444]/15 blur-3xl" />
            </div>
            <div className="relative p-6 sm:p-7 space-y-5">
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      to={`/blog?tag=${encodeURIComponent(tag)}`}
                      className="inline-flex items-center px-2.5 h-6 rounded-full text-[10px] font-bold tracking-[0.1em] bg-[#ef4444]/15 text-[#ef4444] hover:bg-[#ef4444]/25 transition-colors"
                    >
                      {tag.toUpperCase()}
                    </Link>
                  ))}
                </div>
              )}

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground tracking-tight leading-tight">
                {post.title}
              </h1>

              {post.subtitle && post.subtitle.trim() && (
                <p className="text-base text-muted-foreground leading-relaxed">
                  {post.subtitle}
                </p>
              )}

              <AuthorsBlock
                authors={authorsList}
                profiles={post.authorProfiles}
                formattedDate={formattedDate}
                readTime={readTime}
                views={post.views}
                onShare={sharePost}
              />
            </div>
          </div>

          {post.imageUrl && (
            <img
              src={post.imageUrl}
              alt={post.title}
              className="w-full h-auto max-h-[460px] object-cover rounded-xl"
            />
          )}

          <div className="bg-card rounded-2xl border border-border p-6 sm:p-7 shadow-xl">
            <div ref={contentRef} className="prose-content max-w-none">
              {renderMainContent(post.mainContent || post.content)}
            </div>
          </div>
        </article>

        <aside className="hidden lg:block lg:w-80 shrink-0 self-start sticky top-20">
          <div className="space-y-6 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 -mr-1">
            {tocItems.length > 0 && (
              <TocRail
                tocItems={tocItems}
                activeTocId={activeTocId}
                onActivate={setActiveTocId}
              />
            )}
            <NewsletterCard />
            {related.length > 0 && <RelatedCard posts={related} />}
          </div>
        </aside>
      </div>
    </div>
  );
}

function TocRail({
  tocItems,
  activeTocId,
  onActivate,
}: {
  tocItems: TocItem[];
  activeTocId: string;
  onActivate: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[13px] font-medium text-foreground mb-3">
        <List className="w-3.5 h-3.5 text-muted-foreground" />
        On this page
      </div>
      <ul className="relative border-l border-border">
        {tocItems.map(({ id, title, level }) => {
          const active = id === activeTocId;
          return (
            <li key={id} className="relative">
              <a
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onActivate(id);
                  const el = document.getElementById(id);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    history.replaceState(null, '', `#${id}`);
                  }
                }}
                className={`block py-1.5 text-[12px] transition-colors leading-snug ${
                  level === 3 ? 'pl-7' : 'pl-4'
                } ${
                  active
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {title}
              </a>
              {active && (
                <span className="absolute left-[-1px] top-1.5 bottom-1.5 w-0.5 bg-[#ef4444]" />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AuthorsBlock({
  authors,
  profiles,
  formattedDate,
  readTime,
  views,
  onShare,
}: {
  authors: string[];
  profiles?: AuthorProfile[];
  formattedDate: string;
  readTime: number;
  views: number | undefined;
  onShare: () => void;
}) {
  const items = authors.length > 0 ? authors : ['L1Beat'];

  return (
    <div className="flex items-center justify-between gap-4 pt-1">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex shrink-0">
          {items.map((name, idx) => {
            const profile = findProfile(name, profiles);
            return (
              <div
                key={`${name}-${idx}`}
                className={`relative ${idx > 0 ? '-ml-2' : ''}`}
                style={{ zIndex: items.length - idx }}
                title={name}
              >
                <div className="rounded-full ring-2 ring-card overflow-hidden">
                  <AuthorAvatar name={name} profile={profile} size={32} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-foreground flex flex-wrap items-baseline gap-x-1">
            {items.map((name, idx) => {
              const profile = findProfile(name, profiles);
              return (
                <React.Fragment key={name}>
                  {idx > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {idx === items.length - 1 ? 'and' : ','}
                    </span>
                  )}
                  <AuthorCard
                    authorName={name}
                    authorProfiles={profile ? [profile] : []}
                    hideAvatar
                    className="text-foreground"
                  />
                </React.Fragment>
              );
            })}
          </div>
          <div className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-1.5">
            {formattedDate && <span>{formattedDate}</span>}
            {formattedDate && <span>·</span>}
            <span>{readTime} min read</span>
            {views ? (
              <>
                <span>·</span>
                <span>{views.toLocaleString()} views</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <button
        onClick={onShare}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-background/60 border border-border text-foreground hover:bg-accent transition-colors shrink-0"
      >
        <XIcon className="w-3.5 h-3.5" />
        Share
      </button>
    </div>
  );
}

function AuthorAvatar({
  name,
  profile,
  size,
}: {
  name: string;
  profile?: AuthorProfile;
  size: number;
}) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="relative rounded-full overflow-hidden shrink-0 bg-[#ef4444]/15"
      style={{ width: size, height: size }}
    >
      {profile?.avatar ? (
        <img
          src={profile.avatar}
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-sm font-bold text-[#ef4444]">
          {initial}
        </div>
      )}
    </div>
  );
}

function renderMainContent(content: string | undefined): React.ReactNode {
  if (!content) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-muted-foreground italic">No content available.</p>
      </div>
    );
  }

  try {
    const blocks = JSON.parse(content);
    return <ContentRenderer blocks={blocks} />;
  } catch {
    let clean = content.trim();
    if (!clean) return null;
    clean = clean.replace(/<!DOCTYPE[^>]*>/i, '');
    const bodyMatch = clean.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyMatch && bodyMatch[1]) clean = bodyMatch[1];
    else {
      const htmlMatch = clean.match(/<html[^>]*>([\s\S]*)<\/html>/i);
      if (htmlMatch && htmlMatch[1]) clean = htmlMatch[1];
    }
    return (
      <div className="prose-content">
        {parse(clean, {
          replace: (domNode) => {
            if (!(domNode instanceof Element)) return undefined;
            if (domNode.tagName === 'head') return <></>;
            const classNames = (domNode.attribs?.class || '').toLowerCase();
            if (
              domNode.tagName === 'div' &&
              (classNames.includes('image-controls') ||
                classNames.includes('image-buttons') ||
                classNames.includes('fullscreen') ||
                classNames.includes('enlarge'))
            )
              return <></>;
            if (domNode.tagName === 'button') {
              const title = (domNode.attribs?.title || '').toLowerCase();
              const aria = (domNode.attribs?.['aria-label'] || '').toLowerCase();
              if (
                /(fullscreen|enlarge|refresh|zoom|expand|maximize)/.test(
                  `${classNames} ${title} ${aria}`,
                )
              )
                return <></>;
            }
            return undefined;
          },
        })}
      </div>
    );
  }
}

function NewsletterCard() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setTimeout(() => {
      window.open(
        `https://l1beat.substack.com/subscribe?email=${encodeURIComponent(email)}`,
        '_blank',
      );
      setSubmitted(true);
      setSubmitting(false);
    }, 400);
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5 text-center">
        <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-3">
          <Check className="w-4 h-4 text-white" />
        </div>
        <div className="text-sm font-semibold text-foreground mb-1">Thanks for subscribing</div>
        <div className="text-xs text-muted-foreground">
          Finish setup in the new Substack tab.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#ef4444]/30 bg-card p-5">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 rounded-lg bg-[#ef4444]/15 flex items-center justify-center">
          <Mail className="w-3.5 h-3.5 text-[#ef4444]" />
        </div>
        <div className="text-[13px] font-semibold text-foreground">Weekly digest</div>
      </div>
      <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
        One short email every Friday with the chart of the week.
      </p>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@domain.com"
          required
          className="w-full h-9 px-3 rounded-lg bg-background border border-border text-xs placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#ef4444]/30 focus:border-[#ef4444]/40"
        />
        <button
          type="submit"
          disabled={submitting}
          className="w-full h-9 rounded-lg bg-[#ef4444] text-white text-xs font-semibold hover:bg-[#dc2626] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Subscribing…' : 'Subscribe'}
        </button>
      </form>
    </div>
  );
}

function RelatedCard({ posts }: { posts: RelatedPost[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-[10px] font-bold tracking-[0.15em] text-muted-foreground mb-3">
        RELATED
      </div>
      <ul className="space-y-4">
        {posts.map((post) => {
          const thumb = post.imageUrl;
          return (
            <li key={post._id}>
              <Link to={`/blog/${post.slug}`} className="flex gap-3 group">
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    className="w-14 h-14 rounded-md object-cover shrink-0 bg-muted"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-md bg-[#ef4444]/15 shrink-0 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4 text-[#ef4444]" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-[#ef4444] transition-colors">
                    {post.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {formatBlogDate(post.publishedAt)} · {post.readTime} min
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
