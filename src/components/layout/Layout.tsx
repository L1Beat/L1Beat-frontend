import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  BarChart3,
  DollarSign,
  FileText,
  BookOpen,
  Coins,
  Flame,
} from 'lucide-react';
import { TopNav, isNavActive } from './TopNav';
import { Footer } from '../Footer';
import { capsuleDisplacementMap, supportsBackdropRefraction } from './liquidRefraction';

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-2 focus:z-[100] focus:rounded focus:bg-foreground focus:px-3 focus:py-1.5 focus:text-[13px] focus:font-medium focus:text-background"
      >
        Skip to content
      </a>
      <TopNav />
      <main id="content" tabIndex={-1} className="flex-1 min-w-0 focus:outline-none">
        {/* Pages load as separate chunks; this keeps the nav live while one loads. */}
        <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
          <Outlet />
        </Suspense>
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
  { id: 'staking', path: '/staking', icon: Coins, label: 'Staking' },
  { id: 'burn', path: '/burn', icon: Flame, label: 'Burn' },
  { id: 'acps', path: '/acps', icon: FileText, label: 'ACPs' },
  { id: 'blog', path: '/blog', icon: BookOpen, label: 'Blog' },
];

function MobileDock() {
  const { pathname } = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const [lens, setLens] = useState<{ x: number; w: number } | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [refract] = useState(supportsBackdropRefraction);

  const activeIndex = dockItems.findIndex((item) => isNavActive(pathname, item.path));

  // The lens slides under the active tab; measure it after layout and on resize.
  useLayoutEffect(() => {
    const place = () => {
      const el = itemRefs.current[activeIndex];
      setLens(el ? { x: el.offsetLeft, w: el.offsetWidth } : null);
      const nav = navRef.current;
      // Only a visible dock has a size worth refracting.
      if (nav && nav.offsetWidth > 0 && nav.offsetHeight > 0) {
        setSize((prev) => (prev && prev.w === nav.offsetWidth && prev.h === nav.offsetHeight ? prev : { w: nav.offsetWidth, h: nav.offsetHeight }));
      }
    };
    place();
    const ro = new ResizeObserver(place);
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [activeIndex]);

  // Rim highlight follows the pointer or finger, like light catching glass.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const move = (e: PointerEvent) => {
      const r = nav.getBoundingClientRect();
      nav.style.setProperty('--lx', `${Math.min(Math.max(e.clientX - r.left, 0), r.width)}px`);
      nav.style.setProperty('--ly', `${Math.min(Math.max(e.clientY - r.top, -40), r.height + 40)}px`);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', move);
    };
  }, []);

  const filterId = 'dock-refraction';
  const map = refract && size ? capsuleDisplacementMap(size.w, size.h) : '';
  const backdrop = map ? `url(#${filterId}) saturate(170%)` : undefined;

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      className={`liquid-glass md:hidden fixed left-3 right-3 z-50 mx-auto max-w-[420px] flex items-stretch p-1 rounded-full ${map ? 'liquid-glass--refract' : ''}`}
      style={{
        bottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
        backdropFilter: backdrop,
        WebkitBackdropFilter: backdrop,
      }}
    >
      {map && size && (
        <svg aria-hidden width="0" height="0" className="absolute">
          <filter id={filterId} x="0" y="0" width={size.w} height={size.h} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="soft" />
            <feImage href={map} x="0" y="0" width={size.w} height={size.h} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="soft" in2="map" scale="34" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full mix-blend-screen"
        style={{ background: 'radial-gradient(140px circle at var(--lx, 30%) var(--ly, 0px), rgb(255 255 255 / 0.22), transparent 65%)' }}
      />
      {lens && (
        <span
          aria-hidden
          className="absolute top-1 bottom-1 left-0 transition-[transform,width] duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)] motion-reduce:transition-none"
          style={{ width: lens.w, transform: `translateX(${lens.x}px)` }}
        >
          {/* Keyed on the tab so the squash replays each time the lens lands. */}
          <span key={activeIndex} className="liquid-glass-lens liquid-lens-squish block h-full w-full rounded-full" />
        </span>
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
