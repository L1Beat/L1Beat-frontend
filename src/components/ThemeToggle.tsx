import { useTheme } from '../hooks/useTheme';
import { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

interface ThemeToggleProps {
  variant?: 'default' | 'sidebar' | 'compact';
}

export function ThemeToggle({ variant = 'default' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  
  // Update body class to reflect current theme
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);
  
  const handleClick = () => {
    // Important: Calculate the opposite theme
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    
    // Immediately update DOM classes
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(newTheme);
    document.body.setAttribute('data-theme', newTheme);
    
    // Update React state
    toggleTheme();
    
    // Directly update any D3 text elements for immediate feedback
    try {
      const newFill = newTheme === 'dark' ? '#ffffff' : '#000000';
      const newSecondaryFill = newTheme === 'dark' ? 'rgba(226, 232, 240, 0.7)' : 'rgba(30, 41, 59, 0.7)';
      
      const fill = (selector: string, value: string) =>
        document.querySelectorAll(selector).forEach((el) => el.setAttribute('fill', value));
      fill('.node-label', newFill);
      fill('.value-label', newSecondaryFill);
      fill('.diagram-title', newSecondaryFill);
    } catch (err) {
      console.error('Error updating D3 elements immediately:', err);
    }
    
    // Notify other components
    const event = new CustomEvent('themeChanged', { detail: { theme: newTheme } });
    window.dispatchEvent(event);
  };

  const isDark = theme === 'dark';

  if (variant === 'sidebar') {
    return (
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-2.5 h-8 px-4 text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
        aria-label="Toggle theme"
      >
        {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        <span className="text-[12px]">{isDark ? 'Light mode' : 'Dark mode'}</span>
      </button>
    );
  }

  if (variant === 'compact') {
    return (
      <button
        onClick={handleClick}
        className="inline-flex items-center justify-center w-7 h-7 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        title={isDark ? 'Light mode' : 'Dark mode'}
      >
        {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center justify-center w-9 h-9 rounded border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label="Toggle theme"
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}