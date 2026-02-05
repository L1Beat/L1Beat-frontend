/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        // iOS HIG type scale
        'display': ['34px', { lineHeight: '41px', fontWeight: '700' }],
        'heading': ['28px', { lineHeight: '34px', fontWeight: '700' }],
        'title': ['22px', { lineHeight: '28px', fontWeight: '600' }],
        'body': ['17px', { lineHeight: '22px', fontWeight: '400' }],
        'label': ['15px', { lineHeight: '20px', fontWeight: '500' }],
        'caption': ['13px', { lineHeight: '18px', fontWeight: '400' }],
      },
      colors: {
        // Brand colors
        brand: {
          red: '#ef4444',
          'red-dark': '#dc2626',
          'red-deep': '#b91c1c',
        },
        // Design system colors (using CSS variables)
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'var(--popover)',
        'popover-foreground': 'var(--popover-foreground)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        secondary: 'var(--secondary)',
        'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        accent: 'var(--accent)',
        'accent-foreground': 'var(--accent-foreground)',
        destructive: 'var(--destructive)',
        'destructive-foreground': 'var(--destructive-foreground)',
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1c1c1e', // iOS HIG elevated surface
          900: '#000000', // iOS HIG pure black background
          950: '#020617'
        }
      },
      backgroundImage: {
        'dark-gradient': 'linear-gradient(to bottom right, var(--tw-gradient-stops))',
      }
    },
  },
  plugins: [],
};