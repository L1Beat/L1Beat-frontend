import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { ChainDetails } from './pages/ChainDetails';
import ACPs from './pages/ACPs';
import ACPDetails from './pages/ACPDetails';
import { BlogList } from './pages/BlogList';
import { BlogPost } from './pages/BlogPost';
import { Metrics } from './pages/Metrics';
import { ValidatorDetails } from './pages/ValidatorDetails';
import { BrandGuidelines } from './pages/BrandGuidelines';
import { NotFound } from './pages/NotFound';
import { APIPlayground } from './pages/APIPlayground';
import { Flows } from './pages/Flows';
import { Stablecoins } from './pages/Stablecoins';
import { Layout } from './components/layout/Layout';

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
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chain/:chainId" element={<ChainDetails />} />
        <Route path="/metrics" element={<Metrics />} />
        <Route path="/flows" element={<Flows />} />
        <Route path="/stablecoins" element={<Stablecoins />} />
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
  );
}

export default App;
