// design-sync: dedicated Tailwind config so the synced bundle ships a CSS file
// scoped to the design-system components + authored previews (not the whole app).
// Reuses the app's real theme/tokens; only the content scan differs.
import base from '../tailwind.config.js';

export default {
  ...base,
  content: ['./src/**/*.{ts,tsx,jsx,js}', './.design-sync/previews/**/*.tsx'],
  // The bundle ships a STATIC compiled stylesheet (designs get no live JIT), so
  // brand vocabulary the design agent should be able to use must be force-emitted
  // even if the scanned components don't happen to use it. These are named in the
  // conventions header.
  safelist: [
    'font-sans',
    'text-display', 'text-heading', 'text-title', 'text-body', 'text-label', 'text-caption',
    'bg-destructive', 'text-destructive-foreground',
    'text-card-foreground', 'text-secondary-foreground', 'text-accent-foreground',
    'bg-brand-red', 'text-brand-red', 'bg-brand-red-dark', 'bg-brand-red-deep',
  ],
};
