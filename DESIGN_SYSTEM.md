# L1Beat Design System

A design system inspired by Apple's Human Interface Guidelines, optimized for a dark-first blockchain analytics dashboard.

---

## Design Principles

### 1. Clarity
- Clean, precise, uncluttered interfaces
- Every element serves a purpose
- Clear visual hierarchy guides the eye
- Familiar iconography and patterns

### 2. Consistency
- Uniform navigation, typography, and color usage
- Leverage system-provided patterns
- Predictable interactions reduce cognitive load

### 3. Deference
- UI should not distract from data and content
- Let metrics and charts be the focus
- Subtle backgrounds, prominent data

### 4. Depth
- Use layers and translucency for hierarchy
- Elevated surfaces for modals and popovers
- Motion provides context and feedback

---

## Color System

### Dark Mode (Primary)

#### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `--background` | `#000000` | Page background |
| `--background-secondary` | `#1c1c1e` | Cards, elevated surfaces |
| `--background-tertiary` | `#2c2c2e` | Nested elements, inputs |

#### Text
| Token | Hex/Value | Usage |
|-------|-----------|-------|
| `--foreground` | `#ffffff` | Primary text |
| `--foreground-secondary` | `rgba(235, 235, 245, 0.6)` | Secondary text |
| `--foreground-tertiary` | `rgba(235, 235, 245, 0.3)` | Placeholder, disabled |
| `--foreground-quaternary` | `rgba(235, 235, 245, 0.18)` | Subtle hints |

#### Borders & Separators
| Token | Hex/Value | Usage |
|-------|-----------|-------|
| `--border` | `rgba(84, 84, 88, 0.6)` | Default borders |
| `--border-opaque` | `#38383a` | Solid borders |
| `--separator` | `rgba(84, 84, 88, 0.36)` | Dividers |

#### Fills (Interactive Elements)
| Token | Hex/Value | Usage |
|-------|-----------|-------|
| `--fill` | `rgba(120, 120, 128, 0.36)` | Default fill |
| `--fill-secondary` | `rgba(120, 120, 128, 0.32)` | Secondary fill |
| `--fill-tertiary` | `rgba(118, 118, 128, 0.24)` | Tertiary fill |

### Light Mode

#### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `--background` | `#ffffff` | Page background |
| `--background-secondary` | `#f2f2f7` | Cards, elevated surfaces |
| `--background-tertiary` | `#ffffff` | Nested elements |

#### Text
| Token | Hex/Value | Usage |
|-------|-----------|-------|
| `--foreground` | `#000000` | Primary text |
| `--foreground-secondary` | `rgba(60, 60, 67, 0.6)` | Secondary text |
| `--foreground-tertiary` | `rgba(60, 60, 67, 0.3)` | Placeholder, disabled |

### Brand Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--brand-red` | `#ef4444` | Primary accent, CTAs |
| `--brand-red-hover` | `#dc2626` | Hover state |
| `--brand-red-active` | `#b91c1c` | Active/pressed state |

### Semantic Colors
| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--success` | `#34c759` | `#30d158` | Positive states |
| `--warning` | `#ff9500` | `#ff9f0a` | Warnings |
| `--error` | `#ff3b30` | `#ff453a` | Errors, destructive |
| `--info` | `#007aff` | `#0a84ff` | Informational |

---

## Typography

### Font Family
```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
```

### Type Scale
| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Display | 28px | 600 | 1.2 | Page titles |
| Heading | 20px | 600 | 1.3 | Section headers |
| Title | 17px | 600 | 1.4 | Card titles |
| Body | 15px | 400 | 1.5 | Default text |
| Label | 13px | 500 | 1.4 | Labels, captions |
| Caption | 12px | 400 | 1.4 | Small text, metadata |
| Micro | 11px | 500 | 1.3 | Badges, tags |

### Font Weights
- **Regular**: 400 - Body text, descriptions
- **Medium**: 500 - Labels, emphasis
- **Semibold**: 600 - Headings, important values
- **Bold**: 700 - Strong emphasis (use sparingly)

---

## Spacing

### Base Unit
`4px` - All spacing should be multiples of 4px

### Spacing Scale
| Token | Value | Usage |
|-------|-------|-------|
| `--space-1` | 4px | Tight spacing, inline elements |
| `--space-2` | 8px | Related elements |
| `--space-3` | 12px | Default gap |
| `--space-4` | 16px | Section padding |
| `--space-5` | 20px | Card padding |
| `--space-6` | 24px | Section gaps |
| `--space-8` | 32px | Large sections |
| `--space-10` | 40px | Page margins |
| `--space-12` | 48px | Major sections |

### Touch Targets
- **Minimum**: 44×44px for all interactive elements
- **Recommended**: 48×48px for primary actions

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 6px | Small elements, tags |
| `--radius-md` | 8px | Buttons, inputs |
| `--radius-lg` | 12px | Cards |
| `--radius-xl` | 16px | Modals, large cards |
| `--radius-2xl` | 20px | Hero sections |
| `--radius-full` | 9999px | Pills, avatars |

---

## Shadows

Use shadows sparingly in dark mode. Prefer elevation through background color changes.

### Dark Mode
```css
/* Subtle elevation - use sparingly */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);

/* Prefer background elevation instead */
/* Base: #000000 → Elevated: #1c1c1e → Higher: #2c2c2e */
```

### Light Mode
```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
```

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
