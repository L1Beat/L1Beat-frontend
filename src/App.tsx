import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { ChainDetails } from './pages/ChainDetails';
import ACPs  from './pages/ACPs';
import ACPDetails  from './pages/ACPDetails';
import { BlogList } from './pages/BlogList';
import { BlogPost } from './pages/BlogPost';
import { Metrics } from './pages/Metrics';
import { ValidatorDetails } from './pages/ValidatorDetails';
import { BrandGuidelines } from './pages/BrandGuidelines';
import { NotFound } from './pages/NotFound';
import { APIPlayground } from './pages/APIPlayground';
import { StatusBar } from './components/StatusBar';
import { getHealth } from './api';
import { HealthStatus } from './types';

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {});
    const interval = setInterval(() => {
      getHealth().then(setHealth).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Function to extract ACP number from any URL or text
    const extractACPNumber = (url: string, text: string = ''): string | null => {
      const combined = `${url} ${text}`.toLowerCase();

      // Look for ACP patterns in URLs and text
      const patterns = [
        /acp[\/\-_]?(\d+)/i,           // acp/123, acp-123, acp_123, acp123
        /\/(\d+)-[^\/]+/,              // /123-something
        /acps\/(\d+)/i,                // acps/123
        /acp-(\d+)/i,                  // ACP-123
      ];

      for (const pattern of patterns) {
        const match = combined.match(pattern);
        if (match) {
          return match[1];
        }
      }

      return null;
    };

    // Global click handler
    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a');

      if (!link || !link.href) return;

      // Only process clicks on ACP pages
      if (!location.pathname.startsWith('/acps')) return;

      const hrefAttr = link.getAttribute('href') || '';
      const resolvedHref = link.href;
      const linkText = link.textContent || '';

      // ALWAYS ALLOW: Internal navigation (navbar, back buttons)
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
        hrefAttr.startsWith('#'); // Hash links

      if (isInternalNavigation) {
        return; // Let React Router handle these
      }

      // EXTRACT ACP NUMBER from the link
      const acpNumber = extractACPNumber(resolvedHref, linkText);

      if (acpNumber) {
        // This link is ACP-related - route to our internal ACP page
        event.preventDefault();
        event.stopPropagation();
        navigate(`/acps/${acpNumber}`);
      } else {
        // This link is NOT ACP-related - open in new tab
        event.preventDefault();
        event.stopPropagation();
        window.open(resolvedHref, '_blank', 'noopener,noreferrer');
      }
    };

    // Add event listener
    document.addEventListener('click', handleLinkClick, true);

    // Cleanup
    return () => {
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [location.pathname, navigate]);

  const showTabs = location.pathname !== '/brand';

  return (
    <>
      <StatusBar health={health} showTabs={showTabs} />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chain/:chainId" element={<ChainDetails />} />
        <Route path="/metrics" element={<Metrics />} />
        <Route path="/acps" element={<ACPs />} />
        <Route path="/acps/:acpNumber" element={<ACPDetails />} />
        <Route path="/blog" element={<BlogList />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/validator/:validatorId" element={<ValidatorDetails />} />
        <Route path="/api" element={<APIPlayground />} />
        <Route path="/brand" element={<BrandGuidelines />} />
        <Route path="/404" element={<NotFound />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </>
  );
}

export default App;
