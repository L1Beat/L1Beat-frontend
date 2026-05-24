import { useLocation } from 'react-router-dom';
import { HealthStatus } from '../../types';
import { ThemeToggle } from '../ThemeToggle';

const STATIC_TITLES: Record<string, string> = {
  '/': 'Overview',
  '/metrics': 'Network Metrics',
  '/flows': 'Cross-chain Flows',
  '/acps': 'Avalanche Community Proposals',
  '/blog': 'Insights & Research',
  '/api': 'API Playground',
  '/404': 'Not Found',
};

function pageTitle(pathname: string): string {
  if (STATIC_TITLES[pathname]) return STATIC_TITLES[pathname];
  if (pathname.startsWith('/chain/')) return 'Chain Details';
  if (pathname.startsWith('/validator/')) return 'Validator Details';
  if (pathname.startsWith('/acps/')) return 'ACP Details';
  if (pathname.startsWith('/blog/')) return 'Article';
  return '';
}

interface TopBarProps {
  health: HealthStatus | null;
}

export function TopBar({ health }: TopBarProps) {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between h-14 px-4 sm:px-6 border-b border-border bg-background/95 supports-[backdrop-filter]:bg-background/70 supports-[backdrop-filter]:backdrop-blur-md">
      <div className="text-[14px] font-semibold text-foreground">{pageTitle(pathname)}</div>
      <div className="flex items-center gap-2.5">
        {health && (
          <div className="hidden sm:flex items-center gap-2 px-2.5 h-7 rounded-full bg-green-500/10 border border-green-500/20">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[12px] font-medium text-green-500 whitespace-nowrap">
              All Systems Operational
            </span>
          </div>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
