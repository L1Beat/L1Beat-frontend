import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToasterProvider } from './components/Toaster';
import App from './App';

export function render(url: string, context: any) {
  const helmetContext: any = {};
  
  const html = ReactDOMServer.renderToString(
    <React.StrictMode>
      <ThemeProvider>
        <HelmetProvider context={helmetContext}>
          <StaticRouter location={url}>
            <ToasterProvider>
              <App />
            </ToasterProvider>
          </StaticRouter>
        </HelmetProvider>
      </ThemeProvider>
    </React.StrictMode>
  );

  const { helmet } = helmetContext;
  return { html, helmet };
}

