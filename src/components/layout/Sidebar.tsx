import { Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  BarChart3,
  GitFork,
  FileText,
  BookOpen,
  Code,
  Activity,
  Search,
  Palette,
} from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: typeof LayoutGrid;
  badge?: string;
}

const primaryNav: NavItem[] = [
  { id: 'overview', label: 'Overview', path: '/', icon: LayoutGrid },
  { id: 'metrics', label: 'Metrics', path: '/metrics', icon: BarChart3 },
  { id: 'flows', label: 'Flows', path: '/flows', icon: GitFork, badge: 'NEW' },
  { id: 'acps', label: 'ACPs', path: '/acps', icon: FileText },
  { id: 'blog', label: 'Blog', path: '/blog', icon: BookOpen },
  { id: 'api', label: 'API', path: '/api', icon: Code },
];

function isActive(pathname: string, path: string) {
  if (path === '/') {
    return pathname === '/' || pathname.startsWith('/chain/');
  }
  return pathname === path || pathname.startsWith(path + '/');
}

export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-background sticky top-0 self-start h-screen">
      <Link to="/" className="flex items-center gap-2.5 px-5 py-4">
        <div className="w-7 h-7 rounded-lg bg-[#ef4444]/15 flex items-center justify-center">
          <Activity className="w-4 h-4 text-[#ef4444]" />
        </div>
        <span className="text-[17px] font-semibold text-foreground tracking-tight">L1Beat</span>
      </Link>

      <div className="px-4 pb-3">
        <button
          type="button"
          className="w-full flex items-center gap-2 h-9 px-3 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-[13px] flex-1 text-left">Search…</span>
          <kbd className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-0.5">
          {primaryNav.map(({ id, label, path, icon: Icon, badge }) => {
            const active = isActive(pathname, path);
            return (
              <li key={id}>
                <Link
                  to={path}
                  className={`flex items-center gap-2.5 h-9 px-2.5 rounded-lg transition-colors ${
                    active
                      ? 'bg-[#ef4444]/15 text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-[#ef4444]' : ''}`} />
                  <span className={`text-[13px] flex-1 ${active ? 'font-semibold' : 'font-medium'}`}>
                    {label}
                  </span>
                  {badge && (
                    <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-[#ef4444]/15 text-[#ef4444]">
                      {badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 py-3 border-t border-border">
        <Link
          to="/brand"
          className={`flex items-center gap-2.5 h-8 px-2.5 rounded-lg transition-colors ${
            pathname === '/brand'
              ? 'text-foreground bg-accent'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span className="text-[12px] font-medium">Brand</span>
        </Link>
      </div>
    </aside>
  );
}
