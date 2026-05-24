import { GitFork, Sparkles } from 'lucide-react';

export function Flows() {
  return (
    <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <div className="text-[11px] font-bold tracking-[0.15em] text-[#ef4444] mb-1.5">
            INTERCHAIN MESSAGING
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            What's moving between L1s?
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Teleporter &amp; ICM messages, live across active L1 subnets.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-10 flex flex-col items-center justify-center gap-4 min-h-[420px]">
        <div className="w-14 h-14 rounded-2xl bg-[#ef4444]/15 flex items-center justify-center">
          <GitFork className="w-7 h-7 text-[#ef4444]" />
        </div>
        <div className="text-center max-w-md">
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-[#ef4444]" />
            <span className="text-[11px] font-bold tracking-widest text-[#ef4444]">COMING SOON</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Cross-chain Sankey explorer
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Live Sankey of Teleporter &amp; ICM message flows, ranked corridor leaderboards, and per-chain
            inbound/outbound activity. Designed in Pencil; implementation in progress.
          </p>
        </div>
      </div>
    </div>
  );
}
