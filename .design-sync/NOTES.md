# design-sync notes — L1Beat

## Repo shape
- This is the **L1Beat frontend app** (Vite/React/TS, `vite-react-typescript-starter`), NOT a packaged component library. There is no library `dist/` entry of components.
- Sync uses the converter's **package shape with a custom `--entry`** (`.design-sync/entry.tsx`) that re-exports only the scoped design-system surface, so the bundle does not pull in the whole 47-component app.
- Scope = **branding UI primitives + brand identity** (user-chosen 2026-06-21): Select, Switch, Tooltip, Collapsible, Skeleton (`src/components/branding/ui/`) + BrandColors, Typography, LogoShowcase (`src/components/branding/`) + L1BeatLogo (`src/components/L1BeatLogo.tsx`).
- Component list is pinned via `cfg.componentSrcMap`; sub-exports (SelectTrigger/Content/Item…, TooltipTrigger/Content/Provider, CollapsibleTrigger/Content) ride in the bundle via `entry.tsx` for preview composition but don't get their own cards.

## Styling
- Tailwind v3.4 + CSS-variable tokens defined in `src/index.css` (`@layer base { :root {...} }`, light + `.dark`).
- The bundle CSS is compiled by `cfg.buildCmd` into `.design-sync/ds.css` (gitignored, reproducible) using `.design-sync/tailwind.config.mjs` (reuses the app theme; content scans `src/**` + `.design-sync/previews/**`). Re-run buildCmd before each converter run.
- Brand components (`BrandColors`, `Typography`, `LogoShowcase`, `L1BeatLogo`) take a `theme: 'dark' | 'light'` prop and render full showcase blocks.

## Known quirks
- `src/components/branding/ui/switch.tsx` uses `bg-switch-background`, but no `switch-background` color is defined in `tailwind.config.js` (only the `--switch-background` CSS var). The class doesn't resolve; this is an existing app quirk, shipped as-is.

## Known render warns (validate)
- `[RENDER_SKIPPED]` — expected: render check skipped by user choice (no Playwright/Chromium installed; user reviews previews in their own browser via `.review.html`). Previews are NOT machine-verified.
- `[FONT_REMOTE]` "Inter", "Cambria" — expected: the brand font Inter is loaded via a remote Google Fonts `@import` in `.design-sync/ds-input.css` (matches how the app loads it in `index.html`). Cambria is a Tailwind preflight system-serif fallback. No action.
- tokens: "1 missing, below threshold" — non-blocking.

## Static-CSS safelist (important)
- Designs receive only the STATIC compiled `_ds_bundle.css` (no live Tailwind JIT). Tailwind only emits classes it sees in the scanned content, so brand vocabulary the design agent should be able to use is force-emitted via `safelist` in `.design-sync/tailwind.config.mjs`: the Inter type scale (`text-display/heading/title/body/label/caption`, `font-sans`), `bg-destructive` + foreground pairs (`text-card/secondary/accent-foreground`), and the brand red (`bg/text-brand-red` + dark/deep).
- `.design-sync/conventions.md` (the `readmeHeader`) names exactly these. **If you edit the safelist, re-validate the header**: every class/token/component named in conventions.md must exist in `ds-bundle/_ds_bundle.css` / the `components/branding/*` dirs / the bundle. Re-run the grep validation before upload.

## Re-sync risks
- `.design-sync/ds.css` is generated — always re-run `cfg.buildCmd` first or the bundle ships stale/missing utility classes.
- Scope is deliberately narrow; if new branding components are added to `src/components/branding/`, add them to `componentSrcMap` + `entry.tsx`.
- This sync had **no machine render check** (user reviewed in their own browser / the live design pane). Previews were not screenshot-graded, so a re-sync that can run Playwright should spot-check the authored previews visually.
- Open/portal states were not authored for Select (dropdown menu open) — only closed trigger states ship. Tooltip ships forced-open via `cfg.overrides.Tooltip`.
