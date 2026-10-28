# L1Beat Design System

An instrument, not a landing page. L1Beat is a screener and chart tool for
Avalanche L1s, so the interface is built the way terminals and research tools
are built: dense tables, one restrained accent, numbers in a mono face, and
chrome that recedes behind the data.

---

## Design Principles

### 1. Numbers are the hero
- Every number, ID, hash and address is set in IBM Plex Mono with tabular figures, right-aligned in tables.
- Headline values are big; their labels are small, sentence case, and quiet.
- No decorative icons next to metrics. The number carries the meaning.

### 2. Red means down
- Brand red (`#E84142`, Avalanche's own) appears in exactly three places: the logo, the active nav rule, and negative deltas.
- Active states, buttons and selections are neutral (foreground on background), never red.
- Chart series ink is neutral. Green and red keep their up/down meaning.

### 3. Density over decoration
- Table rows are 36 to 38px. Base UI text is 13px, table text 12px.
- Sections are separated by hairlines and flat panels, not shadows or glows.
- No pills with tracked uppercase, no "NEW" or "LIVE" badges. A timestamp says when data was updated.

### 4. Honest data
- Every panel of numbers carries a source footnote.
- Empty states say why ("Indexer is still backfilling"), not just a dash.
- Charts show low / average / high / latest under the plot so the eye can check the line.

---

## Color System

Tokens live in `src/index.css` and are exposed through Tailwind (`bg-card`, `text-muted-foreground`, `text-up`, `bg-brand/…`).

### Dark mode (default)

| Token | Hex | Usage |
|-------|-----|-------|
| `--background` | `#141619` | Page. Graphite, not pure black |
| `--card` | `#1a1d21` | Panels, one step lighter than the page |
| `--popover` | `#1e2227` | Menus, tooltips, floating bars |
| `--muted` / `--secondary` | `#22262b` | Inputs, inactive fills |
| `--accent` | `#262b31` | Hover and selected rows |
| `--border` | `rgba(148, 163, 184, 0.16)` | Hairlines everywhere |
| `--foreground` | `#e8eaed` | Primary text |
| `--muted-foreground` | `#9aa3ad` | Labels, secondary text |
| `--ink` | `#c9ced4` | Default chart series |

### Light mode

| Token | Hex | Usage |
|-------|-----|-------|
| `--background` | `#f5f6f7` | Page, cool paper grey |
| `--card` | `#ffffff` | Panels read as sheets on the grey page |
| `--muted` / `--secondary` | `#eef0f2` | Inputs, inactive fills |
| `--accent` | `#e9ebee` | Hover and selected rows |
| `--border` | `rgba(23, 25, 28, 0.12)` | Hairlines |
| `--foreground` | `#17191c` | Primary text |
| `--muted-foreground` | `#626a73` | Labels |
| `--ink` | `#3a3f45` | Default chart series |

### Brand and semantic

| Token | Dark | Light | Usage |
|-------|------|-------|-------|
| `--brand` | `#e84142` | `#e84142` | Logo, active nav rule. Also the `down` color |
| `--up` | `#3dbe7a` | `#15803d` | Positive deltas, "live" dot (4.5:1 as small text) |
| `--down` | `#f05f5f` | `#c93234` | Negative deltas (4.5:1 as small text; brand red stays `#e84142`) |

### Categorical (charts and category keys)

Blue `#3987e5`, orange `#d95926`, green `#199e70`, violet `#8b5cf6`, gold `#d4a017`, gray `#6b7280`. Never red: on a chart red means down.

---

## Typography

### Families
```css
font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;  /* UI */
font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;            /* numbers, IDs */
```
Loaded from Google Fonts: Plex Sans 400/500/600, Plex Mono 400/500. Use the `.num` utility (`font-mono tabular-nums`) for anything a user scans or copies.

### Scale
| Name | Size / line | Weight | Usage |
|------|-------------|--------|-------|
| Display | 24 / 30 | 600 | Reserved; rarely used |
| Heading | 18 / 24 | 600 | Page title (`PageHeader`) |
| Title | 15 / 20 | 600 | Panel titles |
| Stat | 22 / 28 | 500, mono | Headline numbers (`StatStrip`) |
| Body | 13 / 19 | 400 | Default UI text |
| Table | 12 / 16 | 400, mono for numbers | Table cells |
| Label | 12 / 16 | 400 | Stat labels, descriptions |
| Caption | 11 / 15 | 400 | Footnotes, column headers, deltas |

Weights are 400, 500 and 600 only. Labels are sentence case; no tracked uppercase.

---

## Spacing

Base unit `4px`. Panels pad 16px (`p-4`), 20px on `sm`. Table cells pad 7px vertically. Page sections are 20px apart (`space-y-5`).

---

## Border Radius

| Class | Value | Usage |
|-------|-------|-------|
| `rounded` | 4px | Buttons, inputs, chips, segmented controls |
| `rounded-md` | 6px | Panels, popovers, menus |
| `rounded-lg` | 8px | Rare: large hero panels |
| `rounded-full` | | Avatars and status dots only |

---

## Shadows

None in dark mode. Elevation comes from the surface step (`--background` → `--card` → `--popover`) and hairlines. Floating elements (menus, the compare bar) use a soft `shadow-lg`. Light mode uses no card shadows either.

---

## Shared components (`src/components/instrument`)

| Component | Replaces | Notes |
|-----------|----------|-------|
| `StatStrip` | The four-card KPI grid | One row divided by hairlines, label / mono value / delta, optional tooltip and footnote |
| `PageHeader` | Eyebrow + hero headline | 18px title, one-line description, controls on the right |
| `SegmentedControl` | Red range toggles | Neutral filled active state |
| `UpdatedAgo` | LIVE pill | "Updated 14s ago", "Refreshing" while fetching |
| `SeriesSummary` | | Low / average / high / latest under a chart |

---

## Components

### Cards
```css
/* Dark Mode */
.card {
  background: #1c1c1e;
  border: 1px solid rgba(84, 84, 88, 0.36);
  border-radius: 12px;
  padding: 20px;
}

/* Light Mode */
.card {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
```

### Buttons

#### Primary
```css
.btn-primary {
  background: #ef4444;
  color: #ffffff;
  border-radius: 8px;
  padding: 10px 16px;
  font-weight: 500;
  font-size: 15px;
}

.btn-primary:hover {
  background: #dc2626;
}

.btn-primary:active {
  background: #b91c1c;
}
```

#### Secondary (Ghost)
```css
/* Dark Mode */
.btn-secondary {
  background: rgba(120, 120, 128, 0.24);
  color: #ffffff;
  border: none;
}

.btn-secondary:hover {
  background: rgba(120, 120, 128, 0.36);
}

/* Light Mode */
.btn-secondary {
  background: rgba(0, 0, 0, 0.05);
  color: #000000;
}

.btn-secondary:hover {
  background: rgba(0, 0, 0, 0.1);
}
```

### Inputs
```css
/* Dark Mode */
.input {
  background: #2c2c2e;
  border: 1px solid rgba(84, 84, 88, 0.36);
  border-radius: 8px;
  padding: 10px 12px;
  color: #ffffff;
}

.input:focus {
  border-color: #ef4444;
  outline: none;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2);
}

.input::placeholder {
  color: rgba(235, 235, 245, 0.3);
}
```

### Modals/Dialogs
```css
/* Overlay */
.modal-overlay {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

/* Dialog - Dark Mode */
.modal {
  background: #1c1c1e;
  border: 1px solid rgba(84, 84, 88, 0.36);
  border-radius: 16px;
  padding: 24px;
}
```

### Tables
```css
/* Dark Mode */
.table {
  background: #1c1c1e;
  border-radius: 12px;
  overflow: hidden;
}

.table-header {
  background: #2c2c2e;
  color: rgba(235, 235, 245, 0.6);
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.table-row {
  border-bottom: 1px solid rgba(84, 84, 88, 0.36);
}

.table-row:hover {
  background: rgba(120, 120, 128, 0.12);
}
```

---

## Icons

### Size Scale
| Name | Size | Usage |
|------|------|-------|
| xs | 14px | Inline with small text |
| sm | 16px | Inline with body text |
| md | 20px | Default, standalone |
| lg | 24px | Buttons, navigation |
| xl | 32px | Feature icons |

### Icon Colors
- Match surrounding text color
- Use brand red for emphasis/active states
- Use semantic colors for status indicators

---

## Motion & Animation

### Timing
| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| `--duration-fast` | 100ms | ease-out | Hover states |
| `--duration-normal` | 200ms | ease-in-out | Transitions |
| `--duration-slow` | 300ms | ease-in-out | Page transitions |
| `--duration-slower` | 500ms | ease-in-out | Complex animations |

### Principles
1. **Purposeful** - Animation should provide feedback or context
2. **Quick** - Users shouldn't wait for animations
3. **Natural** - Use easing, avoid linear motion
4. **Consistent** - Same interactions = same animations

### Common Animations
```css
/* Fade in */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Scale in */
@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

/* Slide up */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

---

## Accessibility

### Contrast Ratios
- **Normal text**: Minimum 4.5:1 against background
- **Large text** (18px+ or 14px bold): Minimum 3:1
- **Interactive elements**: Minimum 3:1 for boundaries

### Focus States
```css
/* Visible focus ring for keyboard navigation */
:focus-visible {
  outline: 2px solid #ef4444;
  outline-offset: 2px;
}

/* Remove outline for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Responsive Breakpoints

| Name | Width | Usage |
|------|-------|-------|
| `sm` | 640px | Large phones |
| `md` | 768px | Tablets |
| `lg` | 1024px | Small laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Large screens |

### Mobile-First Approach
- Design for mobile first
- Scale up for larger screens
- Touch targets remain 44px minimum on all sizes

---

## Implementation in Tailwind

### tailwind.config.js additions
```js
module.exports = {
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'surface': {
          DEFAULT: 'var(--background)',
          secondary: 'var(--background-secondary)',
          tertiary: 'var(--background-tertiary)',
        },
        // Fills
        'fill': {
          DEFAULT: 'var(--fill)',
          secondary: 'var(--fill-secondary)',
          tertiary: 'var(--fill-tertiary)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'sans-serif'],
      },
      borderRadius: {
        'DEFAULT': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
      },
    },
  },
};
```

### CSS Variables (index.css)
```css
:root {
  /* Light Mode */
  --background: #ffffff;
  --background-secondary: #f2f2f7;
  --background-tertiary: #ffffff;
  --foreground: #000000;
  --foreground-secondary: rgba(60, 60, 67, 0.6);
  --foreground-tertiary: rgba(60, 60, 67, 0.3);
  --border: rgba(0, 0, 0, 0.1);
  --separator: rgba(60, 60, 67, 0.12);
  --fill: rgba(120, 120, 128, 0.2);
  --fill-secondary: rgba(120, 120, 128, 0.16);
  --fill-tertiary: rgba(120, 120, 128, 0.12);
}

.dark {
  /* Dark Mode */
  --background: #000000;
  --background-secondary: #1c1c1e;
  --background-tertiary: #2c2c2e;
  --foreground: #ffffff;
  --foreground-secondary: rgba(235, 235, 245, 0.6);
  --foreground-tertiary: rgba(235, 235, 245, 0.3);
  --border: rgba(84, 84, 88, 0.36);
  --separator: rgba(84, 84, 88, 0.36);
  --fill: rgba(120, 120, 128, 0.36);
  --fill-secondary: rgba(120, 120, 128, 0.32);
  --fill-tertiary: rgba(120, 120, 128, 0.24);
}
```

---

## Quick Reference

### Do's
- Use semantic color tokens, not raw hex values
- Maintain 44px minimum touch targets
- Test in both light and dark modes
- Use Inter font consistently
- Keep animations under 300ms
- Ensure 4.5:1 contrast ratio minimum

### Don'ts
- Don't use heavy shadows in dark mode
- Don't mix border radius styles inconsistently
- Don't create touch targets smaller than 44px
- Don't use pure white (#fff) text on pure black (#000) - use slightly off-white
- Don't animate layout properties (width, height) - use transform/opacity
- Don't disable focus indicators without alternatives

---

*Based on Apple Human Interface Guidelines. Adapted for L1Beat blockchain analytics dashboard.*
