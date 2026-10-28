import React from 'react';
import type { ComponentProps } from 'react';
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
import { SEO } from './components/SEO';
import { getChains } from './api';
import { chainSeo } from './utils/chainSeo';

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


/** Head tags only, for client-rendered pages that still need their own title and previews. */
export function renderHead(seo: ComponentProps<typeof SEO>) {
  const helmetContext: any = {};
  ReactDOMServer.renderToString(
    <HelmetProvider context={helmetContext}>
      <SEO {...seo} />
    </HelmetProvider>
  );
  return helmetContext.helmet;
}

/** Every chain page's path and head tags. */
export async function getChainPages() {
  const chains = await getChains({ includeInactive: true });
  return chains.map((chain) => chainSeo(chain));
}
