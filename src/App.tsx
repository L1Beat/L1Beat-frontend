import { Suspense, lazy, useEffect } from 'react';
import type { ComponentType } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { LoadingPage } from './components/LoadingSpinner';

// Pages pre-rendered by the SSG build (scripts/ssg.js). renderToString emits
// the Suspense fallback for lazy components, so entry-server passes these in
// eagerly. The browser lazy-loads them like every other page: while a chunk
// loads during hydration, React keeps the server HTML on screen.
export interface PrerenderedPages {
  Dashboard: ComponentType;
  BlogList: ComponentType;
  BlogPost: ComponentType;
  ACPs: ComponentType;
  NotFound: ComponentType;
}

const lazyPrerendered: PrerenderedPages = {
  Dashboard: lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard }))),
  BlogList: lazy(() => import('./pages/BlogList').then(m => ({ default: m.BlogList }))),
  BlogPost: lazy(() => import('./pages/BlogPost').then(m => ({ default: m.BlogPost }))),
  ACPs: lazy(() => import('./pages/ACPs')),
  NotFound: lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound }))),
};

// Client-only routes (not pre-rendered), each its own chunk.
const ChainDetails = lazy(() => import('./pages/ChainDetails').then(m => ({ default: m.ChainDetails })));
const ACPDetails = lazy(() => import('./pages/ACPDetails'));
const Metrics = lazy(() => import('./pages/Metrics').then(m => ({ default: m.Metrics })));
const Compare = lazy(() => import('./pages/Compare').then(m => ({ default: m.Compare })));
const ValidatorDetails = lazy(() => import('./pages/ValidatorDetails').then(m => ({ default: m.ValidatorDetails })));
const BrandGuidelines = lazy(() => import('./pages/BrandGuidelines').then(m => ({ default: m.BrandGuidelines })));
const Services = lazy(() => import('./pages/Services').then(m => ({ default: m.Services })));
const APIPlayground = lazy(() => import('./pages/APIPlayground').then(m => ({ default: m.APIPlayground })));
const Stablecoins = lazy(() => import('./pages/Stablecoins').then(m => ({ default: m.Stablecoins })));
const Burn = lazy(() => import('./pages/Burn').then(m => ({ default: m.Burn })));
const Staking = lazy(() => import('./pages/Staking').then(m => ({ default: m.Staking })));
const Treasuries = lazy(() => import('./pages/Treasuries').then(m => ({ default: m.Treasuries })));
const Dex = lazy(() => import('./pages/Dex').then(m => ({ default: m.Dex })));
const Lending = lazy(() => import('./pages/Lending').then(m => ({ default: m.Lending })));
const Bridges = lazy(() => import('./pages/Bridges').then(m => ({ default: m.Bridges })));
const Interchain = lazy(() => import('./pages/Interchain').then(m => ({ default: m.Interchain })));
const Perps = lazy(() => import('./pages/Perps').then(m => ({ default: m.Perps })));
const DelegatorDetails = lazy(() => import('./pages/DelegatorDetails').then(m => ({ default: m.DelegatorDetails })));

function App({ pages = lazyPrerendered }: { pages?: PrerenderedPages }) {
  const { Dashboard, BlogList, BlogPost, ACPs, NotFound } = pages;
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const extractACPNumber = (url: string, text: string = ''): string | null => {
      const combined = `${url} ${text}`.toLowerCase();
      const patterns = [
        /acp[/\-_]?(\d+)/i,
        /\/(\d+)-[^/]+/,
        /acps\/(\d+)/i,
        /acp-(\d+)/i,
      ];
      for (const pattern of patterns) {
        const match = combined.match(pattern);
        if (match) {
          return match[1];
        }
      }
      return null;
    };

    const handleLinkClick = (event: MouseEvent) => {
      // Leave new-tab and new-window clicks to the browser.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement;
      const link = target.closest('a');

      if (!link || !link.href) return;
      if (!location.pathname.startsWith('/acps')) return;

      const hrefAttr = link.getAttribute('href') || '';
      const resolvedHref = link.href;
      const linkText = link.textContent || '';

      const isInternalNavigation =
        link.closest('nav') ||
        link.closest('[role="navigation"]') ||
        link.closest('.navbar') ||
        link.closest('.nav') ||
        target.closest('.navigation') ||
        hrefAttr === '/acps' ||
        hrefAttr === '/' ||
        hrefAttr.startsWith('/blog') ||
        hrefAttr.startsWith('/chain') ||
        hrefAttr.startsWith('/validator') ||
        hrefAttr.startsWith('/flows') ||
        hrefAttr.startsWith('#');

      if (isInternalNavigation) {
        return;
      }

      const acpNumber = extractACPNumber(resolvedHref, linkText);

      if (acpNumber) {
        event.preventDefault();
        event.stopPropagation();
        navigate(`/acps/${acpNumber}`);
      } else {
        event.preventDefault();
        event.stopPropagation();
        window.open(resolvedHref, '_blank', 'noopener,noreferrer');
      }
    };

    document.addEventListener('click', handleLinkClick, true);

    return () => {
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [location.pathname, navigate]);

  return (
    <Suspense fallback={<LoadingPage />}>
      <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chain/:chainId" element={<ChainDetails />} />
        <Route path="/metrics" element={<Metrics />} />
        <Route path="/compare" element={<Compare />} />
        {/* The Flows page folded into the Overview hero; keep old links alive. */}
        <Route path="/flows" element={<Navigate to="/interchain" replace />} />
        <Route path="/stablecoins" element={<Stablecoins />} />
        <Route path="/burn" element={<Burn />} />
        <Route path="/staking" element={<Staking />} />
        <Route path="/treasuries" element={<Treasuries />} />
        <Route path="/trading" element={<Dex />} />
        <Route path="/lending" element={<Lending />} />
        <Route path="/bridges" element={<Bridges />} />
        <Route path="/interchain" element={<Interchain />} />
        <Route path="/perps" element={<Perps />} />
        <Route path="/dex" element={<Navigate to="/trading" replace />} />
        <Route path="/acps" element={<ACPs />} />
        <Route path="/acps/:acpNumber" element={<ACPDetails />} />
        <Route path="/blog" element={<BlogList />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/validator/:validatorId" element={<ValidatorDetails />} />
        <Route path="/delegator/:address" element={<DelegatorDetails />} />
        <Route path="/api" element={<APIPlayground />} />
        <Route path="/brand" element={<BrandGuidelines />} />
        <Route path="/services" element={<Services />} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
