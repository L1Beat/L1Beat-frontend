import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, FileText, Layers, LayoutGrid, Search, X } from 'lucide-react';
import { getChains } from '../../api';
import type { Chain } from '../../types';
import { acpService } from '../../services/acpService';
import type { EnhancedACP } from '../../types';
import { getBlogPosts, BlogPost } from '../../api/blogApi';

type ResultType = 'page' | 'chain' | 'acp' | 'post';

interface Result {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  to: string;
}

interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
}

const PAGES: Result[] = [
  { id: 'page-overview', type: 'page', title: 'Overview', subtitle: 'Live L1 screener', to: '/' },
  { id: 'page-metrics', type: 'page', title: 'Network Metrics', subtitle: 'Aggregate L1 metrics', to: '/metrics' },
  { id: 'page-flows', type: 'page', title: 'Cross-chain Flows', subtitle: 'ICM & Teleporter activity', to: '/flows' },
  { id: 'page-acps', type: 'page', title: 'ACPs', subtitle: 'Avalanche Community Proposals', to: '/acps' },
  { id: 'page-blog', type: 'page', title: 'Blog', subtitle: 'Insights & research', to: '/blog' },
  { id: 'page-api', type: 'page', title: 'API Playground', subtitle: 'L1Beat REST & WebSocket API', to: '/api' },
  { id: 'page-brand', type: 'page', title: 'Brand', subtitle: 'Brand guidelines', to: '/brand' },
];

const TYPE_ICON: Record<ResultType, typeof LayoutGrid> = {
  page: LayoutGrid,
  chain: Layers,
  acp: FileText,
  post: BookOpen,
};

const TYPE_LABEL: Record<ResultType, string> = {
  page: 'Page',
  chain: 'Chain',
  acp: 'ACP',
  post: 'Article',
};

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [chains, setChains] = useState<Chain[]>([]);
  const [acps, setAcps] = useState<EnhancedACP[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([
      getChains({ includeInactive: true }).catch(() => [] as Chain[]),
      acpService.loadACPs().catch(() => [] as EnhancedACP[]),
      getBlogPosts(40, 0).then((r) => r.data).catch(() => [] as BlogPost[]),
    ]).then(([c, a, p]) => {
      if (!active) return;
      setChains(c);
      setAcps(a);
      setPosts(p);
    });
    return () => {
      active = false;
    };
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    const chainResults: Result[] = chains.map((c) => ({
      id: `chain-${c.chainId}`,
      type: 'chain',
      title: c.chainName,
      subtitle: [c.networkToken?.symbol, c.originalChainId && `EVM ${c.originalChainId}`]
        .filter(Boolean)
        .join(' · '),
      to: `/chain/${c.chainId}`,
    }));
    const acpResults: Result[] = acps.map((a) => ({
      id: `acp-${a.number}`,
      type: 'acp',
      title: `ACP-${a.number} · ${a.title}`,
      subtitle: [a.status, a.track].filter(Boolean).join(' · '),
      to: `/acps/${a.number}`,
    }));
    const postResults: Result[] = posts.map((p) => ({
      id: `post-${p._id}`,
      type: 'post',
      title: p.title,
      subtitle: p.author || p.tags?.[0],
      to: `/blog/${p.slug}`,
    }));
    const all = [...PAGES, ...chainResults, ...acpResults, ...postResults];
    if (!q) return all.slice(0, 8);
    return all
      .filter((r) => {
        const haystack = `${r.title} ${r.subtitle ?? ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 30);
  }, [query, chains, acps, posts]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(results.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = results[active];
        if (r) {
          navigate(r.to);
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, active, navigate, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl rounded-2xl border border-white/[0.08] bg-[#1c1c1e] shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center gap-3 px-4 h-12 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chains, ACPs, articles…"
            className="flex-1 bg-transparent border-0 outline-none text-sm text-foreground placeholder-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="sm:hidden text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No matches for &quot;{query}&quot;
            </div>
          ) : (
            <ul>
              {results.map((r, idx) => {
                const Icon = TYPE_ICON[r.type];
                const isActive = idx === active;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => {
                        navigate(r.to);
                        onClose();
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isActive ? 'bg-[#ef4444]/10' : 'hover:bg-accent'
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-[#ef4444]/15 text-[#ef4444]' : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-foreground truncate">
                          {r.title}
                        </div>
                        {r.subtitle && (
                          <div className="text-[11px] text-muted-foreground truncate">{r.subtitle}</div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold tracking-wider text-muted-foreground shrink-0">
                        {TYPE_LABEL[r.type].toUpperCase()}
                      </span>
                      {isActive && (
                        <ArrowRight className="w-3.5 h-3.5 text-[#ef4444] shrink-0" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 h-9 border-t border-border text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground">↑</kbd>
              <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground">↓</kbd>
              to navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-muted text-muted-foreground">↵</kbd>
              to open
            </span>
          </div>
          <span>{results.length} results</span>
        </div>
      </div>
    </div>
  );
}

