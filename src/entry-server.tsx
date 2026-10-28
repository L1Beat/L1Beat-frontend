import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToasterProvider } from './components/Toaster';
import App from './App';
import type { PrerenderedPages } from './App';
import { Dashboard } from './pages/Dashboard';
import { BlogList } from './pages/BlogList';
import { BlogPost } from './pages/BlogPost';
import ACPs from './pages/ACPs';
import { NotFound } from './pages/NotFound';

// Eager on the server so renderToString emits real page HTML, not fallbacks.
const pages: PrerenderedPages = { Dashboard, BlogList, BlogPost, ACPs, NotFound };

export function render(url: string, _context: any) {
  const helmetContext: any = {};
  
  const html = ReactDOMServer.renderToString(
    <React.StrictMode>
      <ThemeProvider>
        <HelmetProvider context={helmetContext}>
          <StaticRouter location={url}>
            <ToasterProvider>
              <App pages={pages} />
            </ToasterProvider>
          </StaticRouter>
        </HelmetProvider>
      </ThemeProvider>
    </React.StrictMode>
  );

  const { helmet } = helmetContext;
  return { html, helmet };
}

