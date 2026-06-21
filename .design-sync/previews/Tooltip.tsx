import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from 'l1beat-design-system';

// Tooltips only mean anything in their open state, so the card forces `open`
// (cfg.overrides.Tooltip pins cardMode=single + a viewport with headroom above
// the trigger for the default top-side placement).
export function Default() {
  return (
    <TooltipProvider>
      <div className="flex h-44 items-end justify-center bg-background p-6">
        <Tooltip open>
          <TooltipTrigger className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground">
            Total stake
          </TooltipTrigger>
          <TooltipContent>Sum of all validator stake, in AVAX</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
