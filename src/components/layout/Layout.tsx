import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  LayoutGrid,
  BarChart3,
  GitFork,
  DollarSign,
  FileText,
  BookOpen,
  Code,
  Flame,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function Layout() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <AlphaBanner />
        <TopBar />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
      <MobileDock />
    </div>
  );
}

function AlphaBanner() {
  return (
    <div className="bg-[#ef4444]/15 supports-[backdrop-filter]:bg-[#ef4444]/10 supports-[backdrop-filter]:backdrop-blur-md border-b border-[#ef4444]/20 px-4 sm:px-6 py-2 flex items-center justify-center gap-2">
      <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#ef4444] flex-shrink-0" />
      <p className="text-xs sm:text-sm font-medium text-[#ef4444] text-center">
        L1Beat is currently in alpha. Data shown may be incomplete or inaccurate.
      </p>
    </div>
  );
}

const dockItems: { id: string; path: string; icon: typeof LayoutGrid; label: string; disabled?: boolean }[] = [
  { id: 'overview', path: '/', icon: LayoutGrid, label: 'Overview' },
  { id: 'metrics', path: '/metrics', icon: BarChart3, label: 'Metrics' },
  { id: 'flows', path: '/flows', icon: GitFork, label: 'Flows' },
  { id: 'stablecoins', path: '/stablecoins', icon: DollarSign, label: 'Stablecoins' },
  { id: 'burn', path: '/burn', icon: Flame, label: 'Burn' },
  { id: 'acps', path: '/acps', icon: FileText, label: 'ACPs' },
  { id: 'blog', path: '/blog', icon: BookOpen, label: 'Blog' },
  { id: 'api', path: '/api', icon: Code, label: 'API', disabled: true },
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
    <nav className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-2 rounded-2xl bg-card/90 dark:bg-card/95 backdrop-blur-xl border border-border shadow-2xl">
      {dockItems.map(({ id, path, icon: Icon, label, disabled }) => {
        const active = isActive(path);
        if (disabled) {
          return (
            <span
              key={id}
              title="Coming soon"
              aria-disabled="true"
              className="flex items-center px-3 py-2 rounded-xl text-white/25 cursor-not-allowed"
            >
              <Icon className="w-4 h-4" />
            </span>
          );
        }
        return (
          <Link
            key={id}
            to={path}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all duration-200 ${
              active
                ? 'bg-[#ef4444] text-white shadow-lg shadow-[#ef4444]/25'
                : 'text-white/60 hover:text-white/90'
            }`}
          >
            <Icon className="w-4 h-4" />
            {active && <span className="text-xs font-semibold">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
