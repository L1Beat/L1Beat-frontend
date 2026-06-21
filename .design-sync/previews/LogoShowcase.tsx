import { LogoShowcase } from 'l1beat-design-system';

// Logo lockups across sizes and backgrounds. Renders full sections; cardMode=column
// gives it the full card width (cfg.overrides.LogoShowcase).
export function Light() {
  return (
    <div className="bg-background p-6">
      <LogoShowcase theme="light" />
    </div>
  );
}
