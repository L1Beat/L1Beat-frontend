import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App.tsx';
import './index.css';

const container = document.getElementById('root')!;

// Check if the container has any actual element nodes (ignoring comments/whitespace)
// This distinguishes between a pre-rendered page (Production) and an empty shell (Dev)
const hasElementContent = Array.from(container.childNodes).some(
  (node) => node.nodeType === Node.ELEMENT_NODE
);

const AppWrapper = () => (
    <StrictMode>
      <ThemeProvider>
        <HelmetProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </HelmetProvider>
      </ThemeProvider>
    </StrictMode>
  );

if (hasElementContent) {
  hydrateRoot(container, <AppWrapper />);
} else {
  createRoot(container).render(<AppWrapper />);
}
