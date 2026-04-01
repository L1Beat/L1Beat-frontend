import React, { useState, useCallback } from 'react';
import {
  Blocks,
  Network,
  TrendingUp,
  DollarSign,
  ShieldCheck,
  BarChart3,
  Radio,
  Activity,
  Copy,
  Check,
  type LucideIcon,
} from 'lucide-react';
import { FEATURED_QUERIES, isWsEndpoint } from './endpointCatalog';

const ICON_MAP: Record<string, LucideIcon> = {
  Blocks,
  Network,
  TrendingUp,
  DollarSign,
  ShieldCheck,
  BarChart3,
  Radio,
  Activity,
};

function MethodBadge({ method }: { method: 'GET' | 'WS' }) {
  if (method === 'WS') {
    return (
      <span className="bg-purple-500/15 text-purple-600 dark:text-purple-400 text-xs font-mono px-1.5 py-0.5 rounded">
        WS
      </span>
    );
  }
  return (
    <span className="bg-green-500/15 text-green-600 dark:text-green-400 text-xs font-mono px-1.5 py-0.5 rounded">
      GET
    </span>
  );
}

interface LandingStateProps {
  onSelect: (endpointId: string, params: Record<string, string>) => void;
}

export function LandingState({ onSelect }: LandingStateProps) {
  const [copied, setCopied] = useState(false);

  const copyBaseUrl = useCallback(() => {
    navigator.clipboard.writeText('https://api.l1beat.io').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <div className="space-y-3">
        <h1 className="text-[28px] font-bold text-foreground leading-tight">
          Icicle API Playground
        </h1>
        <p className="text-[17px] text-muted-foreground max-w-xl">
          Explore and test the L1Beat API directly from your browser. No auth required.
        </p>

        {/* Base URL chip */}
        <div className="flex items-center gap-2 mt-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
            <span className="font-mono text-sm text-foreground">
              https://api.l1beat.io
            </span>
            <button
              onClick={copyBaseUrl}
              className="text-muted-foreground hover:text-foreground transition-colors ml-1"
              title="Copy base URL"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
          <span>23 REST endpoints</span>
          <span className="text-border">·</span>
          <span>1 WebSocket</span>
          <span className="text-border">·</span>
          <span>Open CORS</span>
          <span className="text-border">·</span>
          <span>100 req/s</span>
        </div>
      </div>

      {/* Featured queries */}
      <div>
        <h2 className="text-[15px] font-semibold text-foreground mb-4">
          Try a featured query
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {FEATURED_QUERIES.map((q) => {
            const Icon = ICON_MAP[q.icon] ?? Activity;
            const isWs = isWsEndpoint(q.endpointId);
            return (
              <button
                key={q.endpointId + q.title}
                onClick={() => onSelect(q.endpointId, q.params)}
                className="bg-card border border-border rounded-xl p-5 text-left hover:border-[#ef4444]/50 hover:bg-[#ef4444]/5 transition-all group"
                style={{ boxShadow: 'var(--card-shadow)' }}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#ef4444]/10 text-[#ef4444] group-hover:bg-[#ef4444]/20 transition-colors flex-shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-medium text-foreground">{q.title}</h3>
                      <MethodBadge method={isWs ? 'WS' : 'GET'} />
                    </div>
                    <p className="text-xs text-muted-foreground">{q.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
