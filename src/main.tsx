import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToasterProvider } from './components/Toaster';
import App from './App.tsx';
import './index.css';

const container = document.getElementById('root')!;

// Check if the container has any actual element nodes (ignoring comments/whitespace)
// This distinguishes between a pre-rendered page (Production) and an empty shell (Dev)
const hasElementContent = Array.from(container.childNodes).some(
  (node) => node.nodeType === Node.ELEMENT_NODE
);

// Hydrate only HTML pre-rendered for this route. Client-only routes (chain
// pages, metrics...) are served the Overview's HTML as a fallback, which can
// never match, so they render fresh instead.
const here = window.location.pathname.replace(/\/+$/, '') || '/';
const canHydrate = hasElementContent && container.dataset.prerendered === here;

const AppWrapper = () => (
    <StrictMode>
      <ThemeProvider hydrating={canHydrate}>
        <HelmetProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ToasterProvider>
              <App />
            </ToasterProvider>
          </BrowserRouter>
        </HelmetProvider>
      </ThemeProvider>
    </StrictMode>
  );

if (canHydrate) {
  hydrateRoot(container, <AppWrapper />);
} else {
  container.replaceChildren();
  createRoot(container).render(<AppWrapper />);
}
