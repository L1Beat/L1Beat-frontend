import { BrandColors } from 'l1beat-design-system';

// Full brand color reference. Renders its own sections; cardMode=column gives it
// the full card width (cfg.overrides.BrandColors).
export function Light() {
  return (
    <div className="bg-background p-6">
      <BrandColors theme="light" />
    </div>
  );
}
