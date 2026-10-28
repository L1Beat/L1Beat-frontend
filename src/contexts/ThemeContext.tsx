import { createContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
  /** True when hydrating pre-rendered HTML (see main.tsx). */
  hydrating?: boolean;
}

function preferredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* storage blocked */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children, hydrating = false }: ThemeProviderProps) {
  // Hydrating pre-rendered HTML: the first render must match the server, which
  // always renders light. The saved theme is applied right after mount. The CSS
  // class is already set by the inline script in index.html, so only JS-drawn
  // colors (logo gradient, toggle icon) switch a frame later.
  const [theme, setTheme] = useState<Theme>(() => (hydrating ? 'light' : preferredTheme()));
  const [synced, setSynced] = useState(!hydrating);

  useEffect(() => {
    if (synced) return;
    setTheme(preferredTheme());
    setSynced(true);
  }, [synced]);

  useEffect(() => {
    // Until synced, theme is the server placeholder; persisting it would overwrite a saved dark theme.
    if (!synced) return;
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);

    // Dispatch a custom event for components that need to know about theme changes
    const event = new CustomEvent('themeChanged', { detail: { theme } });
    window.dispatchEvent(event);
  }, [theme, synced]);

  const toggleTheme = () => {
    setTheme(prev => {
      const newTheme = prev === 'dark' ? 'light' : 'dark';
      return newTheme;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
