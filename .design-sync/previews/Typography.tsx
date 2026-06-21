import { Typography } from 'l1beat-design-system';

// The L1Beat type scale (Inter). Renders full sections; cardMode=column gives it
// the full card width (cfg.overrides.Typography).
export function Light() {
  return (
    <div className="bg-background p-6">
      <Typography theme="light" />
    </div>
  );
}
