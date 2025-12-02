import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { ThemeProvider } from './contexts/ThemeContext';
import App from './App.tsx';
import './index.css';

const container = document.getElementById('root')!;

if (container.hasChildNodes()) {
  hydrateRoot(
    container,
    <StrictMode>
      <ThemeProvider>
        <HelmetProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </HelmetProvider>
      </ThemeProvider>
    </StrictMode>
  );
} else {
  createRoot(container).render(
    <StrictMode>
      <ThemeProvider>
        <HelmetProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </HelmetProvider>
      </ThemeProvider>
    </StrictMode>
  );
}
