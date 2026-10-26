import { useLayoutEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  BarChart3,
  DollarSign,
  FileText,
  BookOpen,
  Code,
  Flame,
} from 'lucide-react';
import { TopNav } from './TopNav';
import { Footer } from '../Footer';

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopNav />
      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
      <Footer />
      {/* clears the floating mobile dock so the footer isn't hidden behind it */}
      <div className="md:hidden h-20" aria-hidden />
      <MobileDock />
    </div>
  );
}

// Labels sit under the icons at phone width, so the longest one is shortened.
const dockItems: { id: string; path: string; icon: typeof LayoutGrid; label: string }[] = [
  { id: 'overview', path: '/', icon: LayoutGrid, label: 'Overview' },
  { id: 'metrics', path: '/metrics', icon: BarChart3, label: 'Metrics' },
  { id: 'stablecoins', path: '/stablecoins', icon: DollarSign, label: 'Stables' },
  { id: 'burn', path: '/burn', icon: Flame, label: 'Burn' },
  { id: 'acps', path: '/acps', icon: FileText, label: 'ACPs' },
  { id: 'blog', path: '/blog', icon: BookOpen, label: 'Blog' },
  { id: 'api', path: '/api', icon: Code, label: 'API' },
];

function MobileDock() {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [lens, setLens] = useState<{ x: number; w: number } | null>(null);

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/' || pathname.startsWith('/chain/');
    }
    return pathname === path || pathname.startsWith(path + '/');
  };
  const activeIndex = dockItems.findIndex((item) => isActive(item.path));

  // The lens slides under the active tab; measure it after layout and on resize.
  useLayoutEffect(() => {
    const place = () => {
      const el = itemRefs.current[activeIndex];
      setLens(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
    };
    place();
    const ro = new ResizeObserver(place);
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [activeIndex]);

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      className="liquid-glass md:hidden fixed left-3 right-3 z-50 mx-auto max-w-[420px] flex items-stretch p-1 rounded-full"
      style={{ bottom: 'max(12px, env(safe-area-inset-bottom, 0px))' }}
    >
      {lens && (
        <span
          aria-hidden
          className="liquid-glass-lens absolute top-1 bottom-1 left-0 rounded-full transition-[transform,width] duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)] motion-reduce:transition-none"
          style={{ width: lens.w, transform: `translateX(${lens.x}px)` }}
        />
      )}
      {dockItems.map(({ id, path, icon: Icon, label }, i) => {
        const active = i === activeIndex;
        return (
          <Link
            key={id}
            ref={(el) => (itemRefs.current[i] = el)}
            to={path}
            aria-current={active ? 'page' : undefined}
            className={`relative z-10 flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 h-12 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 ${
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.25 : 1.75} />
            <span className={`text-[10px] leading-3 truncate max-w-full px-0.5 ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
