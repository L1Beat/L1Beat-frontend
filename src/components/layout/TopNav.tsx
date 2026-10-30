import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { L1BeatLogo } from '../L1BeatLogo';
import { ThemeToggle } from '../ThemeToggle';
import { useTheme } from '../../hooks/useTheme';
import { SearchPalette } from './SearchPalette';

interface NavItem {
  id: string;
  label: string;
  path: string;
}

// Eight destinations fit a top bar as flat links. No menus, no badges.
export const PRIMARY_NAV: NavItem[] = [
  { id: 'overview', label: 'Overview', path: '/' },
  { id: 'metrics', label: 'Metrics', path: '/metrics' },
  { id: 'stablecoins', label: 'Stablecoins', path: '/stablecoins' },
  { id: 'staking', label: 'Staking', path: '/staking' },
  { id: 'burn', label: 'Burn', path: '/burn' },
  { id: 'acps', label: 'ACPs', path: '/acps' },
  { id: 'blog', label: 'Blog', path: '/blog' },
  { id: 'api', label: 'API', path: '/api' },
];

export function isNavActive(pathname: string, path: string) {
  if (path === '/') {
    return pathname === '/' || pathname.startsWith('/chain/') || pathname.startsWith('/validator/');
  }
  return pathname === path || pathname.startsWith(path + '/');
}

/** Height of the header in px. Sticky offsets elsewhere key off this. */
export const TOP_NAV_HEIGHT = 48;

export function TopNav() {
  const { pathname } = useLocation();
  const { theme } = useTheme();
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
    <header className="sticky top-0 z-40 h-12 border-b border-border bg-background">
      <div className="h-full px-4 sm:px-6 flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="L1Beat home">
          <L1BeatLogo size="small" theme={theme} variant="header" />
          <span
            className="hidden sm:inline text-[10px] leading-4 px-1 rounded border border-border text-muted-foreground"
            title="L1Beat is in alpha. Data may be incomplete or inaccurate."
          >
            alpha
          </span>
        </Link>

        <nav className="hidden md:flex items-center h-full" aria-label="Primary">
          {PRIMARY_NAV.map(({ id, label, path }) => {
            const active = isNavActive(pathname, path);
            return (
              <Link
                key={id}
                to={path}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center h-12 px-3 text-[12.5px] transition-colors ${
                  active ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
                {/* Active rule: the one place brand red appears in the chrome. */}
                {active && <span aria-hidden className="absolute left-3 right-3 bottom-0 h-0.5 bg-brand" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hidden sm:flex items-center gap-2 h-7 w-56 lg:w-64 px-2.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-[12px] flex-1 text-left">Search</span>
          <kbd className="num text-[10px] text-muted-foreground">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="sm:hidden inline-flex items-center justify-center w-7 h-7 rounded border border-border text-muted-foreground"
        >
          <Search className="w-3.5 h-3.5" />
        </button>
        <ThemeToggle variant="compact" />
        <SearchPalette open={open} onClose={() => setOpen(false)} />
      </div>
    </header>
  );
}
