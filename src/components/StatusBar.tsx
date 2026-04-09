import { AlertTriangle, LayoutGrid, FileText, BookOpen, BarChart3, Code } from 'lucide-react';
import { HealthStatus } from '../types';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '../hooks/useTheme';
import { L1BeatLogo } from './L1BeatLogo';

interface StatusBarProps {
  health?: HealthStatus | null;
  showTabs?: boolean;
}

export function StatusBar({ health, showTabs = true }: StatusBarProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const navTabs = [
    { id: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutGrid },
    { id: 'metrics', label: 'Metrics', path: '/metrics', icon: BarChart3 },
    { id: 'acps', label: 'ACPs', path: '/acps', icon: FileText },
    { id: 'blog', label: 'Blog', path: '/blog', icon: BookOpen },
    { id: 'api', label: 'API', path: '', icon: Code, comingSoon: true },
  ];

  const location = useLocation();
  const navigate = useNavigate();
  const { theme } = useTheme();

  const handleLogoClick = () => {
    if (!isAnimating) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 1000);
    }
    navigate('/');
  };

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/chain/');
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div className="sticky top-0 z-50">
      {/* Alpha Warning Banner */}
      <div className="bg-[#ef4444]/15 supports-[backdrop-filter]:bg-[#ef4444]/10 supports-[backdrop-filter]:backdrop-blur-md border-b border-[#ef4444]/20 px-4 sm:px-6 py-2 flex items-center justify-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#ef4444] flex-shrink-0" />
        <p className="text-xs sm:text-sm font-medium text-[#ef4444] text-center">
          L1Beat is currently in alpha. Data shown may be incomplete or inaccurate.
        </p>
      </div>

      {/* Main Navigation */}
      <header className="border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/70 supports-[backdrop-filter]:backdrop-blur-md">
        <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Health Status */}
            <div className="flex items-center gap-3 sm:gap-6">
              <button
                onClick={handleLogoClick}
                className="relative transform transition-all duration-300 hover:scale-105 focus:outline-none group"
              >
                <div
                  className={`absolute inset-0 bg-[#ef4444]/20 dark:bg-[#ef4444]/30 rounded-lg filter blur-xl transition-opacity duration-500 ${isAnimating ? 'animate-heartbeat-glow' : 'opacity-0'}`}
                />
                <div className={`relative ${isAnimating ? 'animate-heartbeat' : ''} transition-transform duration-300`}>
                  <L1BeatLogo size="small" theme={theme} variant="header" />
                </div>
              </button>

              {health && (
                <div className="hidden sm:flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-xs sm:text-sm text-green-500 whitespace-nowrap">
                    All Systems Operational
                  </span>
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Tabbed Navigation */}
      {showTabs && (
        <nav className="hidden md:block border-b border-border bg-muted/80 supports-[backdrop-filter]:bg-muted/30 supports-[backdrop-filter]:backdrop-blur-md">
          <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide">
              {navTabs.map(({ id, label, path, icon: Icon, comingSoon }) => {
                if (comingSoon) {
                  return (
                    <div key={id} className="relative group">
                      <button
                        className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b-2 border-transparent text-muted-foreground transition-colors whitespace-nowrap cursor-not-allowed opacity-75"
                        disabled
                      >
                        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span className="text-xs sm:text-sm">{label}</span>
                      </button>
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-card border border-border text-foreground text-sm rounded-md shadow-lg whitespace-nowrap z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                        Coming Soon
                        <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-card border-l border-t border-border rotate-45"></div>
                      </div>
                    </div>
                  );
                }

                const active = isActive(path);
                const tabClassName = `
                  flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b-2 transition-colors whitespace-nowrap
                  ${active
                    ? 'border-[#ef4444] text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                  }
                `;

                return (
                  <Link key={id} to={path} className={tabClassName}>
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="text-xs sm:text-sm">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      )}

      {/* Mobile Floating Bottom Nav */}
      {showTabs && (
        <nav className="md:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2 py-2 rounded-2xl bg-[#1c1c1e]/90 dark:bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/10 shadow-2xl">
          {navTabs.map(({ id, label, path, icon: Icon, comingSoon }) => {
            if (comingSoon) return null;

            const active = isActive(path);
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
                {active && (
                  <span className="text-xs font-semibold">{label}</span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
