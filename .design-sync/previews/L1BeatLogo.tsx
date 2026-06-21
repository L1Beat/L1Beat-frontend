import { L1BeatLogo } from 'l1beat-design-system';

export function Sizes() {
  return (
    <div className="flex flex-col items-start gap-6 bg-background p-8">
      <L1BeatLogo size="small" theme="light" />
      <L1BeatLogo size="medium" theme="light" />
      <L1BeatLogo size="large" theme="light" />
    </div>
  );
}

export function IconOnly() {
  return (
    <div className="flex items-center gap-8 bg-background p-8">
      <L1BeatLogo size="small" iconOnly theme="light" />
      <L1BeatLogo size="medium" iconOnly theme="light" />
      <L1BeatLogo size="large" iconOnly theme="light" />
    </div>
  );
}

export function OnDark() {
  return (
    <div className="flex items-center justify-center bg-[#000000] p-10">
      <L1BeatLogo size="large" theme="dark" />
    </div>
  );
}

export function Header() {
  return (
    <div className="flex items-center bg-background p-8">
      <L1BeatLogo variant="header" size="medium" theme="light" />
    </div>
  );
}
