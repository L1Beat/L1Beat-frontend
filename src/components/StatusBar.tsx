import { AlertTriangle, Menu, X, ExternalLink, LayoutGrid, FileText, BookOpen, BarChart3, Code } from 'lucide-react';
import { HealthStatus } from '../types';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '../hooks/useTheme';
import { L1BeatLogo } from './L1BeatLogo';
import { Snowfall } from './Snowfall';

interface StatusBarProps {
  health?: HealthStatus | null;
  showTabs?: boolean;
}

export function StatusBar({ health, showTabs = true }: StatusBarProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  
  // Navigation tabs configuration
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

  useEffect(() => {
    const controlNavbar = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < lastScrollY || currentScrollY < 50) {
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
        setIsVisible(false);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', controlNavbar);
    return () => window.removeEventListener('scroll', controlNavbar);
  }, [lastScrollY]);

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
    <>
      {/* Christmas Theme - Snowfall */}
      <Snowfall />

      <div className={`sticky top-0 z-50 transform transition-transform duration-300 ${isVisible ? 'translate-y-0' : '-translate-y-full'
        }`}>
        {/* Alpha Warning Banner */}
      <div className="bg-[#ef4444]/15 supports-[backdrop-filter]:bg-[#ef4444]/10 supports-[backdrop-filter]:backdrop-blur-md border-b border-[#ef4444]/20 px-6 py-2 flex items-center justify-center gap-2">
        <AlertTriangle className="w-4 h-4 text-[#ef4444]" />
        <p className="text-sm font-medium text-[#ef4444]">
              L1Beat is currently in alpha. Data shown may be incomplete or inaccurate.
            </p>
      </div>

      {/* Main Navigation */}
      <header className="border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/70 supports-[backdrop-filter]:backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Health Status */}
            <div className="flex items-center gap-6">
              <button
                onClick={handleLogoClick}
                className="relative transform transition-all duration-300 hover:scale-105 focus:outline-none group"
              >
                <div
                  className={`absolute inset-0 bg-[#ef4444]/20 dark:bg-[#ef4444]/30 rounded-lg filter blur-xl transition-opacity duration-500 ${isAnimating ?
                    'animate-heartbeat-glow' : 'opacity-0'
                    }`}
                />
                <div className={`relative ${isAnimating ? 'animate-heartbeat' : ''
                    } transition-transform duration-300`}>
                  <L1BeatLogo size="small" theme={theme} variant="header" />
                </div>
              </button>

              {health && (
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-sm text-green-500">
                    All Systems Operational
                  </span>
                </div>
              )}
            </div>

            {/* Desktop Navigation - Right side actions */}
            <nav className="hidden md:flex items-center gap-2">
              <ThemeToggle />
            </nav>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white focus:outline-none"
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          <div className={`md:hidden transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
            }`}>
            <div className="px-2 pt-2 pb-3 space-y-1 border-t border-border">
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between px-3">
                  <span className="text-sm font-medium">Theme</span>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tabbed Navigation */}
      {showTabs && (
        <nav className="border-b border-border bg-muted/80 supports-[backdrop-filter]:bg-muted/30 supports-[backdrop-filter]:backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex gap-1 overflow-x-auto md:overflow-visible">
              {navTabs.map(({ id, label, path, icon: Icon, comingSoon }) => {
                if (comingSoon) {
                  return (
                    <div 
                      key={id} 
                      className="relative group"
                    >
                      <button
                        className="flex items-center gap-2 px-4 py-3 border-b-2 border-transparent text-muted-foreground transition-colors whitespace-nowrap cursor-not-allowed opacity-75"
                        disabled
                      >
                        <Icon className="w-4 h-4" />
                        {label}
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
                  flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap
                  ${active 
                    ? 'border-[#ef4444] text-foreground' 
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                  }
                `;

                return (
                  <Link 
                    key={id} 
                    to={path}
                    className={tabClassName}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
        </div>
      </div>
        </nav>
      )}
      </div>
    </>
  );
}