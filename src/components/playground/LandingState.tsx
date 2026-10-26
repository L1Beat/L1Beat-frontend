import { useState, useCallback } from 'react';
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
import { FEATURED_QUERIES, REST_ENDPOINTS, WS_ENDPOINTS, isWsEndpoint } from './endpointCatalog';
import { PLAYGROUND_API_BASE } from './constants';

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
    <span className="bg-green-500/15 text-up text-xs font-mono px-1.5 py-0.5 rounded">
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
    navigator.clipboard.writeText(PLAYGROUND_API_BASE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-[18px] leading-6 font-semibold text-foreground">API playground</h1>
        <p className="text-[12px] text-muted-foreground max-w-xl">
          Call the L1Beat REST and WebSocket API from the browser. No key needed.
        </p>

        {/* Base URL chip */}
        <div className="flex items-center gap-2 pt-1">
          <div className="flex items-center gap-2 h-8 px-2.5 rounded bg-background border border-border">
            <span className="num text-[12px] text-foreground">
              {PLAYGROUND_API_BASE}
            </span>
            <button
              onClick={copyBaseUrl}
              className="text-muted-foreground hover:text-foreground transition-colors ml-1"
              title="Copy base URL"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-up" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground pt-1">
          <div className="flex items-baseline gap-1.5"><dd className="num text-foreground">{REST_ENDPOINTS.length}</dd><dt>REST endpoints</dt></div>
          <div className="flex items-baseline gap-1.5"><dd className="num text-foreground">{WS_ENDPOINTS.length}</dd><dt>WebSocket</dt></div>
          <div className="flex items-baseline gap-1.5"><dt>Open CORS</dt></div>
          <div className="flex items-baseline gap-1.5"><dd className="num text-foreground">60</dd><dt>req/min, burst 10</dt></div>
        </dl>
      </div>

      {/* Featured queries */}
      <div>
        <h2 className="text-[13px] font-medium text-foreground py-2">Featured queries</h2>
        <div className="border-t border-border">
          {FEATURED_QUERIES.map((q) => {
            const Icon = ICON_MAP[q.icon] ?? Activity;
            const isWs = isWsEndpoint(q.endpointId);
            return (
              <button
                key={q.endpointId + q.title}
                onClick={() => onSelect(q.endpointId, q.params)}
                className="w-full flex items-center gap-3 h-11 px-2 -mx-2 text-left border-b border-border/50 hover:bg-accent/40 transition-colors"
              >
                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <MethodBadge method={isWs ? 'WS' : 'GET'} />
                <span className="text-[12.5px] font-medium text-foreground shrink-0">{q.title}</span>
                <span className="text-[12px] text-muted-foreground truncate">{q.description}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
