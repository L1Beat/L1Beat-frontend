import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { SearchPalette } from './SearchPalette';

const STATIC_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/metrics': 'Network Metrics',
  '/flows': 'Cross-chain Flows',
  '/acps': 'Avalanche Community Proposals',
  '/blog': 'Insights & Research',
  '/api': 'API Playground',
  '/404': 'Not Found',
};

function pageTitle(pathname: string): string {
  if (STATIC_TITLES[pathname]) return STATIC_TITLES[pathname];
  if (pathname.startsWith('/chain/')) return 'Chain Details';
  if (pathname.startsWith('/validator/')) return 'Validator Details';
  if (pathname.startsWith('/acps/')) return 'ACP Details';
  if (pathname.startsWith('/blog/')) return 'Article';
  return '';
}

export function TopBar() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex items-center gap-4 sm:gap-6 h-14 px-4 sm:px-6 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/70 supports-[backdrop-filter]:backdrop-blur-md">
      <div className="text-[14px] font-semibold text-foreground shrink-0 truncate">
        {pageTitle(pathname)}
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden sm:flex flex-1 items-center gap-2 h-9 w-full max-w-2xl px-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-[13px] flex-1 text-left">Search chains, ACPs, articles…</span>
        <kbd className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          ⌘K
        </kbd>
      </button>
      <SearchPalette open={open} onClose={() => setOpen(false)} />
    </header>
  );
}
