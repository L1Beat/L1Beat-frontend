/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        // UI text. Plex Sans has true tabular figures, so numbers line up even
        // outside the mono face.
        sans: ['IBM Plex Sans', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Numbers, IDs, hashes, addresses. Anything a user scans or copies.
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Instrument scale: dense, one family, weights 400-600 only.
        'display': ['24px', { lineHeight: '30px', fontWeight: '600' }],
        'heading': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'title': ['15px', { lineHeight: '20px', fontWeight: '600' }],
        'body': ['13px', { lineHeight: '19px', fontWeight: '400' }],
        'label': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'caption': ['11px', { lineHeight: '15px', fontWeight: '400' }],
      },
      colors: {
        // Brand colors
        brand: {
          DEFAULT: 'rgb(var(--brand-rgb) / <alpha-value>)',
          hover: 'var(--brand-hover)',
          red: '#e84142',
          'red-dark': '#d23536',
          'red-deep': '#b02a2b',
        },
        up: 'rgb(var(--up-rgb) / <alpha-value>)',
        down: 'rgb(var(--down-rgb) / <alpha-value>)',
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        // Design system colors (using CSS variables)
        background: 'rgb(var(--background-rgb) / <alpha-value>)',
        foreground: 'rgb(var(--foreground-rgb) / <alpha-value>)',
        card: 'rgb(var(--card-rgb) / <alpha-value>)',
        'card-foreground': 'var(--card-foreground)',
        popover: 'rgb(var(--popover-rgb) / <alpha-value>)',
        'popover-foreground': 'var(--popover-foreground)',
        primary: 'var(--primary)',
        'primary-foreground': 'var(--primary-foreground)',
        'switch-background': 'var(--switch-background)',
        secondary: 'rgb(var(--secondary-rgb) / <alpha-value>)',
        'secondary-foreground': 'var(--secondary-foreground)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        'muted-foreground': 'rgb(var(--muted-foreground-rgb) / <alpha-value>)',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-foreground': 'var(--accent-foreground)',
        destructive: 'var(--destructive)',
        'destructive-foreground': 'var(--destructive-foreground)',
        border: 'rgb(var(--border-rgb) / <alpha-value>)',
        stage: 'rgb(var(--stage-rgb) / <alpha-value>)',
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