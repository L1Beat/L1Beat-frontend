import { useTheme } from '../hooks/useTheme';
import { useState, useEffect } from 'react';
import * as d3 from 'd3';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [isAnimating, setIsAnimating] = useState(false);
  
  // Update body class to reflect current theme
  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);
  
  const handleClick = () => {
    setIsAnimating(true);
    
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
      
      d3.selectAll('.node-label').attr('fill', newFill);
      d3.selectAll('.value-label').attr('fill', newSecondaryFill);
      d3.selectAll('.diagram-title').attr('fill', newSecondaryFill);
    } catch (err) {
      console.error('Error updating D3 elements immediately:', err);
    }
    
    // Notify other components
    const event = new CustomEvent('themeChanged', { detail: { theme: newTheme } });
    window.dispatchEvent(event);
    
    setTimeout(() => setIsAnimating(false), 500);
  };

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}