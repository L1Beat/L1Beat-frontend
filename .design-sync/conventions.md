## Building with the L1Beat design system

This is the L1Beat brand kit: a set of React components plus the L1Beat design tokens (an iOS-HIG-inspired palette with an Avalanche-red accent, set in **Inter**). Compose the components for UI; style your own layout glue with the token classes below.

### Setup and theming
- **No provider is required** for `Select`, `Switch`, `Collapsible`, `Skeleton`. `Tooltip` already wraps itself in a provider, so a single tooltip works standalone; if a screen has many tooltips, wrap it once in `TooltipProvider` to share open/close timing.
- **Dark mode**: light is the default. To switch a screen (or any subtree) to the dark palette, put `className="dark"` on an ancestor element — every color token below flips automatically. Pair it with `bg-background text-foreground` on that root so the surface and text follow the theme.
- The **brand-identity** components — `BrandColors`, `Typography`, `LogoShowcase`, `L1BeatLogo` — take a `theme="light" | "dark"` prop. Pass the value matching the background they sit on (these are reference/showcase blocks; for normal app UI reach for the primitives plus token classes).

### Styling idiom: Tailwind utility classes backed by CSS-variable tokens
Designs receive a **static** stylesheet, so style with the named token classes below (or the matching `var(--*)` in an inline `style` when a utility doesn't exist). Avoid one-off raw colors like `bg-blue-500` — they won't follow the L1Beat theme.

**Surfaces** (`bg-*`) — and their text pairs:
- `bg-background` / `text-foreground` — the page
- `bg-card` / `text-card-foreground` — cards, panels, list rows
- `bg-popover` / `text-popover-foreground` — menus, dropdowns
- `bg-muted` / `text-muted-foreground` — subdued fills, secondary text
- `bg-secondary` / `text-secondary-foreground`, `bg-accent` / `text-accent-foreground`
- `bg-primary` / `text-primary-foreground` — primary actions (primary is near-black in light, white in dark)
- `bg-destructive` / `text-destructive-foreground` — errors, destructive actions
- `border-border` — all hairline borders/dividers

**Brand accent (Avalanche red, `#ef4444`)**: `text-brand-red`, `bg-brand-red` (plus `bg-brand-red-dark`, `bg-brand-red-deep`). Use sparingly for emphasis, links, active states.

**Type scale (Inter)** — `font-sans` is Inter; the scale carries its own size + weight:
`text-display` (34/700) · `text-heading` (28/700) · `text-title` (22/600) · `text-body` (17/400) · `text-label` (15/500) · `text-caption` (13/400).

Every token also exists as a CSS variable: `var(--background)`, `var(--foreground)`, `var(--card)`, `var(--primary)`, `var(--muted-foreground)`, `var(--border)`, `var(--destructive)`, etc.

### Where the truth lives
- `styles.css` and the `_ds_bundle.css` it imports hold every token's real value (light + `.dark`) and the emitted utility classes — read them before inventing a class.
- Each component's `*.prompt.md` (usage) and `*.d.ts` (props) document its exact API.

### One idiomatic example
```tsx
// Components come from the L1Beat library; style layout with token classes.
import { Switch } from 'l1beat-design-system';

<div className="rounded-xl border border-border bg-card text-foreground">
  <div className="flex items-center justify-between px-4 py-3">
    <div>
      <div className="text-label">Dark mode</div>
      <div className="text-caption text-muted-foreground">Use the dark palette</div>
    </div>
    <Switch defaultChecked />
  </div>
</div>
```
