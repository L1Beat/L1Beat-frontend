import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, Search } from 'lucide-react';
import { L1BeatLogo } from '../L1BeatLogo';
import { ThemeToggle } from '../ThemeToggle';
import { useTheme } from '../../hooks/useTheme';
import { SearchPalette } from './SearchPalette';

export interface NavLink {
  id: string;
  label: string;
  path: string;
  /** One line under the label in a menu. */
  hint?: string;
}

export type NavEntry = NavLink | { id: string; label: string; items: NavLink[] };

// Direct links for the pages people come back to; related pages grouped in
// small menus so the bar stays short as pages are added.
export const PRIMARY_NAV: NavEntry[] = [
  { id: 'overview', label: 'Overview', path: '/' },
  {
    id: 'network',
    label: 'Network',
    items: [
      { id: 'metrics', label: 'Metrics', path: '/metrics', hint: 'Activity and fees across every L1' },
      { id: 'burn', label: 'Burn', path: '/burn', hint: 'AVAX burned on the C-Chain, live' },
    ],
  },
  {
    id: 'markets',
    label: 'Markets',
    items: [
      { id: 'stablecoins', label: 'Stablecoins', path: '/stablecoins', hint: 'Supply, volume and holders' },
      { id: 'trading', label: 'Trading', path: '/trading', hint: 'DEX volume and top pools' },
      { id: 'perps', label: 'Perpetuals', path: '/perps', hint: 'Leveraged trading on GMX' },
      { id: 'lending', label: 'Lending', path: '/lending', hint: 'Rates, usage and caps on Aave and BENQI' },
      { id: 'bridges', label: 'Bridges', path: '/bridges', hint: 'Money bridged in and out of Avalanche' },
      { id: 'treasuries', label: 'Treasuries & ETFs', path: '/treasuries', hint: 'AVAX held by companies and funds' },
    ],
  },
  { id: 'staking', label: 'Staking', path: '/staking' },
  { id: 'acps', label: 'ACPs', path: '/acps' },
  {
    id: 'more',
    label: 'More',
    items: [
      { id: 'blog', label: 'Blog', path: '/blog', hint: 'Research and updates' },
      { id: 'api', label: 'API', path: '/api', hint: 'Query L1Beat data' },
    ],
  },
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
      <div className="h-full px-4 sm:px-6 flex items-center gap-6 md:gap-4 lg:gap-6">
        <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="L1Beat home">
          <L1BeatLogo size="small" theme={theme} variant="header" />
        </Link>

        <nav className="hidden md:flex items-center h-full" aria-label="Primary">
          {PRIMARY_NAV.map((entry) =>
            'items' in entry ? (
              <NavMenu key={entry.id} label={entry.label} items={entry.items} pathname={pathname} />
            ) : (
              <Link
                key={entry.id}
                to={entry.path}
                aria-current={isNavActive(pathname, entry.path) ? 'page' : undefined}
                className={navItemCls(isNavActive(pathname, entry.path))}
              >
                {entry.label}
                {isNavActive(pathname, entry.path) && <ActiveRule />}
              </Link>
            ),
          )}
        </nav>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="hidden sm:flex md:hidden lg:flex items-center gap-2.5 h-8 w-56 lg:w-64 xl:w-[26rem] 2xl:w-[32rem] px-3 rounded-md border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/60 transition-colors"
        >
          <Search className="w-4 h-4 shrink-0" />
          <span className="text-[13px] flex-1 text-left truncate">
            <span className="xl:hidden">Search</span>
            <span className="hidden xl:inline">Search chains, validators, addresses, ACPs…</span>
          </span>
          <kbd className="num text-[10px] leading-4 px-1.5 rounded border border-border bg-background text-muted-foreground">⌘K</kbd>
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search"
          className="sm:hidden md:inline-flex lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-muted/40 text-muted-foreground"
        >
          <Search className="w-4 h-4" />
        </button>
        <ThemeToggle variant="compact" />
        <SearchPalette open={open} onClose={() => setOpen(false)} />
      </div>
    </header>
  );
}

const navItemCls = (active: boolean) =>
  `relative flex items-center gap-1 h-12 px-2 lg:px-3 text-[12.5px] transition-colors ${
    active ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
  }`;

// Active rule: the one place brand red appears in the chrome.
function ActiveRule() {
  return <span aria-hidden className="absolute left-2 right-2 lg:left-3 lg:right-3 bottom-0 h-0.5 bg-brand" />;
}

function NavMenu({ label, items, pathname }: { label: string; items: NavLink[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number>();
  const active = items.some((i) => isNavActive(pathname, i.path));
  const menuId = `nav-menu-${label.toLowerCase()}`;

  // Close on navigation, Escape and clicks outside.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Hover opens; a short delay before closing lets the pointer cross the gap.
  const enter = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      ref={ref}
      className="relative h-full"
      // Hover only for a mouse: on touch, the emulated hover would open the menu and the click close it again.
      onPointerEnter={(e) => e.pointerType === 'mouse' && enter()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && leave()}
      onBlur={(e) => !ref.current?.contains(e.relatedTarget as Node | null) && setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className={navItemCls(active)}
      >
        {label}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        {active && <ActiveRule />}
      </button>
      {open && (
        <div className="absolute left-0 top-full pt-1 z-50">
          <ul id={menuId} className="min-w-[240px] rounded-md border border-border bg-card shadow-lg p-1">
            {items.map((item) => {
              const current = isNavActive(pathname, item.path);
              return (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    aria-current={current ? 'page' : undefined}
                    className={`block rounded px-3 py-2 transition-colors hover:bg-accent focus-visible:bg-accent outline-none ${current ? 'bg-accent/60' : ''}`}
                  >
                    <span className={`block text-[13px] ${current ? 'font-medium text-foreground' : 'text-foreground'}`}>{item.label}</span>
                    {item.hint && <span className="block text-[11px] text-muted-foreground">{item.hint}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
