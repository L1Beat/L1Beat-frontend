import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { ParamDef } from './endpointCatalog';
import { Switch } from '../branding/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../branding/ui/select';
import { getChains } from '../../api';

interface SmartParamInputProps {
  param: ParamDef;
  value: string;
  onChange: (value: string) => void;
  hasError: boolean;
}

const PRIMARY_SUBNET = { value: '11111111111111111111111111111111LpoYY', label: 'Primary Network' };

// Radix Select treats empty string as "no value" / placeholder sentinel.
// We use the literal string "__any__" internally and convert it to "" on the way out,
// so the "— any —" option participates correctly in the controlled value system.
const ANY_VALUE = '__any__';

function toSelectValue(v: string): string {
  return v === '' ? ANY_VALUE : v;
}

function fromSelectValue(v: string): string {
  return v === ANY_VALUE ? '' : v;
}

interface DropdownSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  required: boolean;
  errorClass: string;
  placeholder?: string;
}

function DropdownSelect({
  value,
  onChange,
  options,
  required,
  errorClass,
  placeholder,
}: DropdownSelectProps) {
  const selectValue = toSelectValue(value);

  return (
    <Select
      value={selectValue}
      onValueChange={(v) => onChange(fromSelectValue(v))}
    >
      <SelectTrigger
        className={[
          'group w-full rounded-lg bg-muted border text-foreground text-sm',
          'h-auto px-3 py-2',
          'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#ef4444] focus-visible:border-[#ef4444]',
          'data-[placeholder]:text-muted-foreground',
          '[&>svg:last-child]:hidden',
          'transition-colors duration-150',
          errorClass,
        ].join(' ')}
      >
        <SelectValue placeholder={placeholder ?? '— select —'} />
        {/* Custom chevron — rotates via data-[state=open] on the trigger (group) */}
        <ChevronDown
          className={[
            'size-4 text-muted-foreground shrink-0 ml-auto',
            'transition-transform duration-200',
            'group-data-[state=open]:rotate-180',
          ].join(' ')}
          aria-hidden="true"
        />
      </SelectTrigger>

      <SelectContent
        className={[
          'bg-card border border-border rounded-lg shadow-lg',
          'z-50',
          // Fade + slide-down animation
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-1',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-1',
          'duration-150',
        ].join(' ')}
        position="popper"
        sideOffset={4}
      >
        {!required && (
          <SelectItem
            value={ANY_VALUE}
            className={[
              'rounded-md text-sm text-muted-foreground cursor-pointer',
              'hover:bg-muted focus:bg-muted focus:text-foreground',
              'data-[state=checked]:bg-[#ef4444]/10 data-[state=checked]:text-foreground',
            ].join(' ')}
          >
            — any —
          </SelectItem>
        )}
        {options.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            className={[
              'rounded-md text-sm text-foreground cursor-pointer',
              'hover:bg-muted focus:bg-muted focus:text-foreground',
              'data-[state=checked]:bg-[#ef4444]/10 data-[state=checked]:text-foreground',
            ].join(' ')}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface SubnetIdInputProps {
  value: string;
  onChange: (value: string) => void;
  required: boolean;
  errorClass: string;
}

function SubnetIdInput({ value, onChange, required, errorClass }: SubnetIdInputProps) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([PRIMARY_SUBNET]);

  useEffect(() => {
    getChains()
      .then((chains) => {
        const seen = new Set<string>();
        seen.add(PRIMARY_SUBNET.value);
        const extras: { value: string; label: string }[] = [];
        for (const chain of chains) {
          if (chain.subnetId && !seen.has(chain.subnetId)) {
            seen.add(chain.subnetId);
            extras.push({ value: chain.subnetId, label: chain.chainName });
          }
        }
        if (extras.length > 0) {
          setOptions([PRIMARY_SUBNET, ...extras]);
        }
      })
      .catch(() => {/* keep defaults */});
  }, []);

  return (
    <DropdownSelect
      value={value}
      onChange={onChange}
      options={options}
      required={required}
      errorClass={errorClass}
    />
  );
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
        const opts = (param.options ?? []).map((opt) => ({ value: opt, label: opt }));
        return (
          <DropdownSelect
            value={value}
            onChange={onChange}
            options={opts}
            required={param.required}
            errorClass={errorClass}
          />
        );
      }

      case 'subnetId':
        return (
          <SubnetIdInput
            value={value}
            onChange={onChange}
            required={param.required}
            errorClass={errorClass}
          />
        );

      case 'boolean': {
        const isOn = value === 'true';
        return (
          <div className="flex items-center justify-between py-1">
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                isOn
                  ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
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

      case 'int': {
        const hasRange = param.min !== undefined || param.max !== undefined;
        const rangeHint = hasRange
          ? [
              param.min !== undefined ? `min ${param.min}` : '',
              param.max !== undefined ? `max ${param.max}` : '',
            ]
              .filter(Boolean)
              .join(', ')
          : '';
        return (
          <>
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
            {hasRange && (
              <span className="text-xs text-muted-foreground">{rangeHint}</span>
            )}
          </>
        );
      }

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
