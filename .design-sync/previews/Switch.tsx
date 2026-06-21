import { Switch } from 'l1beat-design-system';

export function Off() {
  return (
    <div className="flex items-center gap-3 bg-background p-6 text-foreground">
      <Switch id="off" />
      <label htmlFor="off" className="text-sm">Email notifications</label>
    </div>
  );
}

export function On() {
  return (
    <div className="flex items-center gap-3 bg-background p-6 text-foreground">
      <Switch id="on" defaultChecked />
      <label htmlFor="on" className="text-sm">Email notifications</label>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="flex items-center gap-3 bg-background p-6 text-foreground">
      <Switch id="disabled" disabled />
      <label htmlFor="disabled" className="text-sm text-muted-foreground">Beta features (coming soon)</label>
    </div>
  );
}

export function SettingsList() {
  const rows = [
    { label: 'Dark mode', on: true },
    { label: 'Show testnet chains', on: false },
    { label: 'Compact tables', on: true },
  ];
  return (
    <div className="w-72 divide-y divide-border rounded-xl border border-border bg-card text-foreground">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between px-4 py-3">
          <span className="text-sm">{r.label}</span>
          <Switch defaultChecked={r.on} />
        </div>
      ))}
    </div>
  );
}
