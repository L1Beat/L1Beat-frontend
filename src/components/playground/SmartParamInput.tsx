import React, { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { ParamDef } from './endpointCatalog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../branding/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../branding/ui/command';
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

function ChainIdInput({
  param,
  value,
  onChange,
  chains,
  hasError,
}: SmartParamInputProps) {
  const [open, setOpen] = useState(false);

  if (chains.length === 0) {
    return (
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '' || /^\d*$/.test(v)) onChange(v);
        }}
        placeholder={param.placeholder ?? '43114'}
        className={`w-full px-3 py-2 rounded-lg bg-muted border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-[#ef4444] ${
          hasError ? 'border-red-500 ring-1 ring-red-500' : 'border-border'
        }`}
      />
    );
  }

  const selected = chains.find((c) => String(c.evmChainId) === value);
  const displayLabel = selected
    ? `${selected.name} · ${selected.evmChainId}`
    : value
    ? `Chain ${value}`
    : 'Select chain...';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-[#ef4444] ${
            hasError ? 'border-red-500 ring-1 ring-red-500' : 'border-border'
          }`}
        >
          <span className={selected || value ? 'text-foreground' : 'text-muted-foreground'}>
            {displayLabel}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search chains..." />
          <CommandList>
            <CommandEmpty>No chain found.</CommandEmpty>
            <CommandGroup>
              {chains.map((chain) => (
                <CommandItem
                  key={chain.evmChainId}
                  value={`${chain.name} ${chain.evmChainId}`}
                  onSelect={() => {
                    onChange(String(chain.evmChainId));
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 w-4 h-4 flex-shrink-0 ${
                      String(chain.evmChainId) === value ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <span className="flex-1 truncate">{chain.name}</span>
                  <span className="text-muted-foreground text-xs ml-2 font-mono">
                    {chain.evmChainId}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SmartParamInput(props: SmartParamInputProps) {
  const { param, value, onChange, chains, hasError } = props;

  const errorClass = hasError
    ? 'border-red-500 ring-1 ring-red-500'
    : 'border-border';

  const baseInputClass = `w-full px-3 py-2 rounded-lg bg-muted border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-[#ef4444] ${errorClass}`;

  const renderInput = () => {
    switch (param.type) {
      case 'chainId':
        return (
          <ChainIdInput
            param={param}
            value={value}
            onChange={onChange}
            chains={chains}
            hasError={hasError}
          />
        );

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
            <span className="text-sm text-muted-foreground">
              {isOn ? 'Enabled' : 'Disabled'}
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
