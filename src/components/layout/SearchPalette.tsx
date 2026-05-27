import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Clock, Command, Copy, FileText, Flame, Layers, LayoutGrid, Moon, Search, Sun, Trash2, X } from 'lucide-react';
import { getChains } from '../../api';
import type { Chain } from '../../types';
import { acpService } from '../../services/acpService';
import type { EnhancedACP } from '../../types';
import { getBlogPosts, BlogPost } from '../../api/blogApi';
import { useTheme } from '../../hooks/useTheme';
import { useToast } from '../Toaster';

type ResultType = 'page' | 'chain' | 'acp' | 'post' | 'command';

interface Result {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  to?: string;
  action?: () => void | Promise<void>;
  keywords?: string;
  icon?: typeof Command;
  closeAfter?: boolean;
}

const RECENT_STORAGE_KEY = 'searchPalette:recents';
const RECENT_MAX = 5;

function loadRecents(): Result[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((r): r is Result =>
      r && typeof r.id === 'string' && typeof r.type === 'string' && typeof r.title === 'string' && typeof r.to === 'string'
    ).slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function saveRecent(result: Result) {
  // Only persist navigable results, not one-off commands.
  if (result.type === 'command' || !result.to) return;
  try {
    const current = loadRecents().filter(r => r.id !== result.id);
    const stripped: Result = {
      id: result.id,
      type: result.type,
      title: result.title,
      subtitle: result.subtitle,
      to: result.to,
    };
    const next = [stripped, ...current].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be full or unavailable; silent fail is fine here
  }
}

function clearRecents() {
  try {
    localStorage.removeItem(RECENT_STORAGE_KEY);
  } catch {
    // silent fail
  }
}

interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
}

const PAGES: Result[] = [
  { id: 'page-overview', type: 'page', title: 'Overview', subtitle: 'Live L1 screener', to: '/' },
  { id: 'page-metrics', type: 'page', title: 'Network Metrics', subtitle: 'Aggregate L1 metrics', to: '/metrics' },
  { id: 'page-flows', type: 'page', title: 'Cross-chain Flows', subtitle: 'ICM & Teleporter activity', to: '/flows' },
  { id: 'page-stablecoins', type: 'page', title: 'Stablecoins', subtitle: 'Supply, holders, and 24h activity', to: '/stablecoins' },
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
  command: Command,
};

const TYPE_LABEL: Record<ResultType, string> = {
  page: 'Page',
  chain: 'Chain',
  acp: 'ACP',
  post: 'Article',
  command: 'Cmd',
};

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [chains, setChains] = useState<Chain[]>([]);
  const [acps, setAcps] = useState<EnhancedACP[]>([]);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [recents, setRecents] = useState<Result[]>([]);

  const commands = useMemo<Result[]>(() => {
    const isDark = theme === 'dark';
    return [
      {
        id: 'cmd-theme',
        type: 'command',
        title: isDark ? 'Switch to light mode' : 'Switch to dark mode',
        subtitle: 'Toggle theme',
        keywords: 'theme dark light mode toggle appearance',
        icon: isDark ? Sun : Moon,
        action: () => toggleTheme(),
        closeAfter: true,
      },
      {
        id: 'cmd-copy-url',
        type: 'command',
        title: 'Copy current URL',
        subtitle: 'Share this page',
        keywords: 'copy url link share clipboard',
        icon: Copy,
        action: async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            toast('URL copied to clipboard', 'success');
          } catch {
            toast('Failed to copy URL', 'error');
          }
        },
      },
      {
        id: 'cmd-clear-recents',
        type: 'command',
        title: 'Clear recent searches',
        subtitle: 'Wipe ⌘K history on this device',
        keywords: 'clear recents history wipe reset',
        icon: Trash2,
        action: () => {
          clearRecents();
          setRecents([]);
          toast('Recent searches cleared', 'success');
        },
      },
    ];
  }, [theme, toggleTheme]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setRecents(loadRecents());
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

  const chainResults = useMemo<Result[]>(
    () =>
      chains.map((c) => ({
        id: `chain-${c.chainId}`,
        type: 'chain',
        title: c.chainName,
        subtitle: [c.networkToken?.symbol, c.originalChainId && `EVM ${c.originalChainId}`]
          .filter(Boolean)
          .join(' · '),
        to: `/chain/${c.chainId}`,
      })),
    [chains],
  );
  const acpResults = useMemo<Result[]>(
    () =>
      acps.map((a) => ({
        id: `acp-${a.number}`,
        type: 'acp',
        title: `ACP-${a.number} · ${a.title}`,
        subtitle: [a.status, a.track].filter(Boolean).join(' · '),
        to: `/acps/${a.number}`,
      })),
    [acps],
  );
  const postResults = useMemo<Result[]>(
    () =>
      posts.map((p) => ({
        id: `post-${p._id}`,
        type: 'post',
        title: p.title,
        subtitle: p.author || p.tags?.[0],
        to: `/blog/${p.slug}`,
      })),
    [posts],
  );

  const topChains = useMemo<Result[]>(() => {
    return chains
      .filter((c) => c.network !== 'fuji' && (c.tps?.value ?? 0) >= 0.05)
      .sort((a, b) => (b.tps?.value ?? 0) - (a.tps?.value ?? 0))
      .slice(0, 5)
      .map((c) => ({
        id: `chain-${c.chainId}`,
        type: 'chain' as const,
        title: c.chainName,
        subtitle: c.tps?.value
          ? `${c.tps.value.toFixed(2)} TPS${c.networkToken?.symbol ? ` · ${c.networkToken.symbol}` : ''}`
          : c.networkToken?.symbol,
        to: `/chain/${c.chainId}`,
      }));
  }, [chains]);

  const sections = useMemo<{ label: string; icon: typeof Clock; items: Result[] }[]>(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const all = [...commands, ...PAGES, ...chainResults, ...acpResults, ...postResults];
      const filtered = all
        .filter((r) =>
          `${r.title} ${r.subtitle ?? ''} ${r.keywords ?? ''}`.toLowerCase().includes(q),
        )
        .slice(0, 30);
      return [{ label: 'Results', icon: Search, items: filtered }];
    }
    const out: { label: string; icon: typeof Clock; items: Result[] }[] = [];
    out.push({ label: 'Commands', icon: Command, items: commands });
    if (recents.length > 0) out.push({ label: 'Recent', icon: Clock, items: recents });
    if (topChains.length > 0) out.push({ label: 'Top chains', icon: Flame, items: topChains });
    out.push({ label: 'Pages', icon: LayoutGrid, items: PAGES });
    return out;
  }, [query, commands, chainResults, acpResults, postResults, recents, topChains]);

  const flatResults = useMemo<Result[]>(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const handleSelect = async (r: Result) => {
    if (r.type === 'command') {
      await r.action?.();
      if (r.closeAfter) onClose();
      return;
    }
    saveRecent(r);
    if (r.to) {
      navigate(r.to);
      onClose();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(flatResults.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const r = flatResults[active];
        if (r) handleSelect(r);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flatResults, active, navigate, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      <div
        className="absolute inset-0 bg-black/60 dark:bg-black/60 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl rounded-2xl border border-border bg-popover shadow-2xl shadow-black/40 dark:shadow-black/60 overflow-hidden">
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
          {flatResults.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No matches for &quot;{query}&quot;
            </div>
          ) : (
            (() => {
              let cursor = 0;
              return sections.map((section) => {
                const SectionIcon = section.icon;
                return (
                  <div key={section.label} className="mb-1 last:mb-0">
                    <div className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                      <SectionIcon className="w-3 h-3" />
                      <span>{section.label}</span>
                      <span className="text-muted-foreground/60 font-medium normal-case tracking-normal">
                        ({section.items.length})
                      </span>
                    </div>
                    <ul>
                      {section.items.map((r) => {
                        const idx = cursor++;
                        const Icon = r.icon ?? TYPE_ICON[r.type];
                        const isActive = idx === active;
                        return (
                          <li key={r.id}>
                            <button
                              type="button"
                              onMouseEnter={() => setActive(idx)}
                              onClick={() => handleSelect(r)}
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
                  </div>
                );
              });
            })()
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
          <span>{flatResults.length} results</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

