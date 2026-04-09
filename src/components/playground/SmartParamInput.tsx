import React from 'react';
import { ParamDef } from './endpointCatalog';
import { Switch } from '../branding/ui/switch';

export interface ChainOption {
  evmChainId: number;
  name: string;
  logoUrl?: string;
}

interface SmartParamInputProps {
  param: ParamDef;
  value: string;
  onChange: (value: string) => void;
  chains: ChainOption[];
  hasError: boolean;
}

function ChainIdInput() {

  return (
    <div
      title="More chains coming soon"
      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted border border-border text-sm cursor-default select-none"
    >
      <span className="text-foreground">Avalanche C-Chain</span>
      <span className="text-muted-foreground font-mono text-xs">43114</span>
    </div>
  );
}

export function SmartParamInput(props: SmartParamInputProps) {
  const { param, value, onChange, hasError } = props;

  const errorClass = hasError
    ? 'border-red-500 ring-1 ring-red-500'
    : 'border-border';

  const baseInputClass = `w-full px-3 py-2 rounded-lg bg-muted border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-[#ef4444] ${errorClass}`;

  const renderInput = () => {
    switch (param.type) {
      case 'chainId':
        return <ChainIdInput />;

      case 'enum': {
        const isRequired = param.required;
        return (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg bg-muted border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-[#ef4444] ${errorClass}`}
          >
            {!isRequired && <option value="">— any —</option>}
            {param.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      }

      case 'boolean': {
        const isOn = value === 'true';
        return (
          <div className="flex items-center justify-between py-1">
            <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${isOn ? 'bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
              {isOn ? 'on' : 'off'}
            </span>
            <Switch
              checked={isOn}
              onCheckedChange={(checked) => onChange(checked ? 'true' : '')}
              className={hasError ? 'ring-1 ring-red-500' : ''}
            />
          </div>
        );
      }

      case 'int':
        return (
          <input
            type="text"
            inputMode="numeric"
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '' || /^-?\d*$/.test(v)) onChange(v);
            }}
            placeholder={param.placeholder ?? (param.default ?? '')}
            className={baseInputClass}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={baseInputClass}
          />
        );

      case 'string':
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={param.placeholder ?? ''}
            className={baseInputClass}
          />
        );
    }
  };

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1 text-xs font-medium text-foreground">
        <span className="font-mono text-muted-foreground">{param.name}</span>
        {param.required && (
          <span className="text-[#ef4444] ml-0.5">*</span>
        )}
        {param.kind === 'path' && (
          <span className="text-xs px-1 py-0.5 rounded bg-muted text-muted-foreground ml-1">
            path
          </span>
        )}
      </label>
      {renderInput()}
      <p className="text-xs text-muted-foreground mt-1">{param.description}</p>
    </div>
  );
}
