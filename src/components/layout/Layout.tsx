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

const dockItems: { id: string; path: string; icon: typeof LayoutGrid; label: string; disabled?: boolean }[] = [
  { id: 'overview', path: '/', icon: LayoutGrid, label: 'Overview' },
  { id: 'metrics', path: '/metrics', icon: BarChart3, label: 'Metrics' },
  { id: 'stablecoins', path: '/stablecoins', icon: DollarSign, label: 'Stablecoins' },
  { id: 'burn', path: '/burn', icon: Flame, label: 'Burn' },
  { id: 'acps', path: '/acps', icon: FileText, label: 'ACPs' },
  { id: 'blog', path: '/blog', icon: BookOpen, label: 'Blog' },
  { id: 'api', path: '/api', icon: Code, label: 'API' },
];

function MobileDock() {
  const { pathname } = useLocation();

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/' || pathname.startsWith('/chain/');
    }
    return pathname === path || pathname.startsWith(path + '/');
  };

  return (
    <nav className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-0.5 px-1.5 py-1.5 rounded-md bg-popover border border-border shadow-lg">
      {dockItems.map(({ id, path, icon: Icon, label, disabled }) => {
        const active = isActive(path);
        if (disabled) {
          return (
            <span
              key={id}
              title="Coming soon"
              aria-disabled="true"
              className="flex items-center px-3 py-2 rounded text-muted-foreground/30 cursor-not-allowed"
            >
              <Icon className="w-4 h-4" />
            </span>
          );
        }
        return (
          <Link
            key={id}
            to={path}
            className={`flex items-center gap-1.5 px-3 py-2 rounded transition-colors ${
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            {active && <span className="text-[12px] font-medium">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
