import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from 'l1beat-design-system';
import { ChevronDown } from 'lucide-react';

export function Open() {
  return (
    <div className="w-80 bg-background p-6">
      <Collapsible defaultOpen className="rounded-xl border border-border bg-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
          What is an L1?
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4 text-sm text-muted-foreground">
          An L1 is a sovereign blockchain that settles its own transactions and
          runs its own validator set, rather than inheriting security from another chain.
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function Closed() {
  return (
    <div className="w-80 bg-background p-6">
      <Collapsible className="rounded-xl border border-border bg-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground">
          How is stake measured?
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4 text-sm text-muted-foreground">
          Stake is the total amount of the native token bonded by validators securing the network.
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
