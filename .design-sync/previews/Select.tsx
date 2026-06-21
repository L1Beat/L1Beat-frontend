import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from 'l1beat-design-system';

function Chains() {
  return (
    <SelectContent>
      <SelectGroup>
        <SelectLabel>Layer 1</SelectLabel>
        <SelectItem value="avalanche">Avalanche</SelectItem>
        <SelectItem value="ethereum">Ethereum</SelectItem>
      </SelectGroup>
      <SelectSeparator />
      <SelectGroup>
        <SelectLabel>L1 / Subnet</SelectLabel>
        <SelectItem value="dexalot">Dexalot</SelectItem>
        <SelectItem value="dfk">DeFi Kingdoms</SelectItem>
      </SelectGroup>
    </SelectContent>
  );
}

export function Default() {
  return (
    <div className="w-64 bg-background p-6">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a chain" />
        </SelectTrigger>
        <Chains />
      </Select>
    </div>
  );
}

export function Selected() {
  return (
    <div className="w-64 bg-background p-6">
      <Select defaultValue="avalanche">
        <SelectTrigger>
          <SelectValue placeholder="Select a chain" />
        </SelectTrigger>
        <Chains />
      </Select>
    </div>
  );
}

export function Small() {
  return (
    <div className="w-64 bg-background p-6">
      <Select defaultValue="ethereum">
        <SelectTrigger size="sm">
          <SelectValue placeholder="Select a chain" />
        </SelectTrigger>
        <Chains />
      </Select>
    </div>
  );
}

export function Disabled() {
  return (
    <div className="w-64 bg-background p-6">
      <Select disabled defaultValue="avalanche">
        <SelectTrigger>
          <SelectValue placeholder="Select a chain" />
        </SelectTrigger>
        <Chains />
      </Select>
    </div>
  );
}
