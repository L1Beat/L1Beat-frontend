import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  BarChart3,
  GitFork,
  DollarSign,
  FileText,
  BookOpen,
  Code,
  Palette,
} from 'lucide-react';
import { L1BeatLogo } from '../L1BeatLogo';
import { ThemeToggle } from '../ThemeToggle';
import { useTheme } from '../../hooks/useTheme';

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
  { id: 'stablecoins', label: 'Stablecoins', path: '/stablecoins', icon: DollarSign, badge: 'NEW' },
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
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [isBeating, setIsBeating] = useState(false);

  const handleLogoClick = () => {
    if (!isBeating) {
      setIsBeating(true);
      setTimeout(() => setIsBeating(false), 1000);
    }
    navigate('/');
  };

  return (
    <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-background sticky top-0 self-start h-screen">
      <button
        type="button"
        onClick={handleLogoClick}
        className="relative flex items-center px-4 py-4 focus:outline-none group"
        aria-label="L1Beat home"
      >
        <span
          className={`absolute inset-2 rounded-lg bg-[#ef4444]/25 blur-xl pointer-events-none transition-opacity duration-500 ${
            isBeating ? 'animate-heartbeat-glow' : 'opacity-0'
          }`}
        />
        <span className={`relative ${isBeating ? 'animate-heartbeat' : ''}`}>
          <L1BeatLogo size="small" theme={theme} variant="header" />
        </span>
      </button>

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

      <div className="px-3 py-3 border-t border-border space-y-0.5">
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
        <ThemeToggle variant="sidebar" />
      </div>
    </aside>
  );
}
