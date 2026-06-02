import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { LoadingPage } from './components/LoadingSpinner';

// Eager: pages that are pre-rendered by the SSG build (scripts/ssg.js).
// renderToString emits the Suspense *fallback* for lazy components, so these
// must stay eager to ship real HTML for SEO / no first-paint flash.
import { Dashboard } from './pages/Dashboard';
import { BlogList } from './pages/BlogList';
import { BlogPost } from './pages/BlogPost';
import ACPs from './pages/ACPs';
import { NotFound } from './pages/NotFound';

// Lazy: client-only routes (not pre-rendered). Each becomes its own chunk, so
// the initial bundle no longer carries mermaid, d3-sankey, charts, etc.
const ChainDetails = lazy(() => import('./pages/ChainDetails').then(m => ({ default: m.ChainDetails })));
const ACPDetails = lazy(() => import('./pages/ACPDetails'));
const Metrics = lazy(() => import('./pages/Metrics').then(m => ({ default: m.Metrics })));
const ValidatorDetails = lazy(() => import('./pages/ValidatorDetails').then(m => ({ default: m.ValidatorDetails })));
const BrandGuidelines = lazy(() => import('./pages/BrandGuidelines').then(m => ({ default: m.BrandGuidelines })));
const APIPlayground = lazy(() => import('./pages/APIPlayground').then(m => ({ default: m.APIPlayground })));
const Flows = lazy(() => import('./pages/Flows').then(m => ({ default: m.Flows })));
const Stablecoins = lazy(() => import('./pages/Stablecoins').then(m => ({ default: m.Stablecoins })));
const Burn = lazy(() => import('./pages/Burn').then(m => ({ default: m.Burn })));

function App() {
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
        <Route path="/flows" element={<Flows />} />
        <Route path="/stablecoins" element={<Stablecoins />} />
        <Route path="/burn" element={<Burn />} />
        <Route path="/acps" element={<ACPs />} />
        <Route path="/acps/:acpNumber" element={<ACPDetails />} />
        <Route path="/blog" element={<BlogList />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/validator/:validatorId" element={<ValidatorDetails />} />
        <Route path="/api" element={<APIPlayground />} />
        <Route path="/brand" element={<BrandGuidelines />} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Route>
      </Routes>
    </Suspense>
  );
}

export default App;
