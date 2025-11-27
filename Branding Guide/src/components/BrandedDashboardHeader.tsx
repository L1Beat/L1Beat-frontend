import { L1BeatLogo } from './L1BeatLogo';
import { Sun, Moon } from 'lucide-react';

interface BrandedDashboardHeaderProps {
  theme?: 'dark' | 'light';
  onThemeToggle?: () => void;
}

export function BrandedDashboardHeader({ theme = 'dark', onThemeToggle }: BrandedDashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/50 backdrop-blur-sm" style={{ backgroundColor: 'rgba(10, 10, 10, 0.8)' }}>
      {/* Warning Banner */}
      <div className="bg-[#ef4444]/10 border-b border-[#ef4444]/20 px-6 py-2 flex items-center justify-center gap-2">
        <svg className="w-4 h-4" style={{ color: '#ef4444' }} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-sm" style={{ color: '#ef4444' }}>
          L1Beat is currently in alpha. Data shown may be incomplete or inaccurate.
        </span>
      </div>

      {/* Main Header */}
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          {/* Branded Logo */}
          <L1BeatLogo size="small" theme={theme} />
          
          {/* Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-green-500">All Systems Operational</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-2">
          <a
            href="/blog"
            className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors"
          >
            Blog
          </a>
          <a
            href="/docs"
            className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors flex items-center gap-1"
          >
            Docs
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <a
            href="/acps"
            className="px-4 py-2 rounded-lg text-sm hover:bg-white/5 transition-colors"
          >
            ACPs
          </a>
          <button
            onClick={onThemeToggle}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}
