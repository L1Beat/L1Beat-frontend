import { useState, useCallback, type ReactNode } from 'react';
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
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { FEATURED_QUERIES, REST_ENDPOINTS, WS_ENDPOINTS, isWsEndpoint } from './endpointCatalog';
import { PLAYGROUND_API_BASE, PLAYGROUND_OPENAPI_URL } from './constants';

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
      <span className="bg-purple-500/15 text-purple-700 dark:text-purple-400 text-xs font-mono px-1.5 py-0.5 rounded">
        WS
      </span>
    );
  }
  return (
    <span className="bg-green-500/15 text-green-800 dark:text-up text-xs font-mono px-1.5 py-0.5 rounded">
      GET
    </span>
  );
}

// What a developer needs to know before building on the API, shown under the featured queries.
const C = ({ children }: { children: ReactNode }) => (
  <code className="num text-[11.5px] text-foreground bg-muted/60 rounded px-1">{children}</code>
);

const USAGE: { title: string; body: ReactNode }[] = [
  {
    title: 'Versions',
    body: (
      <>
        Every REST endpoint is under <C>/api/v1</C>. Within v1 we only add fields and endpoints. Renames or
        removals ship as <C>/api/v2</C>, announced ahead of time on <a className="underline underline-offset-2 hover:text-foreground" href="https://x.com/l1beat_io" target="_blank" rel="noopener noreferrer">X</a>.
      </>
    ),
  },
  {
    title: 'OpenAPI spec',
    body: (
      <>
        Every endpoint with its parameters and response schema, in OpenAPI 3:{' '}
        <a className="underline underline-offset-2 hover:text-foreground" href={PLAYGROUND_OPENAPI_URL} target="_blank" rel="noopener noreferrer">openapi.json</a>.
        Import it into Postman or Insomnia, or generate a typed client.
      </>
    ),
  },
  {
    title: 'Responses and errors',
    body: (
      <>
        JSON. Results come in <C>data</C>, with <C>meta</C> on paginated lists. Errors look like{' '}
        <C>{'{"error":{"code","message"}}'}</C>: <C>INVALID_PARAMETER</C> (400), <C>NOT_FOUND</C> (404),{' '}
        <C>RATE_LIMITED</C> (429), <C>INTERNAL_ERROR</C> (500). Treasuries & ETFs returns{' '}
        <C>{'{"error":"message"}'}</C> instead. Unknown query parameters are ignored.
      </>
    ),
  },
  {
    title: 'Rate limits',
    body: (
      <>
        180 requests a minute per IP, with bursts of 30. <C>X-RateLimit-Remaining</C> shows what is left and a 429
        carries <C>Retry-After</C>. Treasuries & ETFs has its own limit of 1,000 requests per 15 minutes.
      </>
    ),
  },
  {
    title: 'Pagination',
    body: (
      <>
        Pass <C>meta.next_cursor</C> back as <C>cursor</C> (as <C>before</C> on ICM Messages), or step{' '}
        <C>offset</C> while <C>has_more</C> is true. Treat cursors as opaque.
      </>
    ),
  },
  {
    title: 'Units and dates',
    body: (
      <>
        P-Chain AVAX amounts are nAVAX strings (1 AVAX = 10<sup>9</sup> nAVAX) and token amounts are strings in
        base units. USD values are numbers. Times are UTC; <C>days</C> windows are complete UTC days ending
        yesterday.
      </>
    ),
  },
  {
    title: 'Coverage and freshness',
    body: (
      <>
        EVM, DeFi and ICM data cover the C-Chain (43114); P-Chain data covers every L1. Data runs about a block
        behind the chain (see Sync Status), and responses can be cached for 60 seconds.
      </>
    ),
  },
  {
    title: 'Use and credit',
    body: (
      <>
        Free to use, with no key. Please credit <span className="text-foreground">Data: L1Beat</span> with a link
        to l1beat.io. Provided as is, without an uptime guarantee.
      </>
    ),
  },
  {
    title: 'Contact',
    body: (
      <>
        Questions, bugs or higher limits:{' '}
        <a className="underline underline-offset-2 hover:text-foreground" href="mailto:hello@l1beat.io">hello@l1beat.io</a> or{' '}
        <a className="underline underline-offset-2 hover:text-foreground" href="https://x.com/l1beat_io" target="_blank" rel="noopener noreferrer">@l1beat_io</a>.
      </>
    ),
  },
];

function UsingTheApi() {
  return (
    <section aria-labelledby="using-the-api">
      <h2 id="using-the-api" className="text-[13px] font-medium text-foreground py-2">Using the API</h2>
      <dl className="border-t border-border grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8">
        {USAGE.map((item) => (
          <div key={item.title} className="py-3 border-b border-border/50">
            <dt className="text-[12.5px] font-medium text-foreground">{item.title}</dt>
            <dd className="mt-1 text-[12px] leading-5 text-muted-foreground">{item.body}</dd>
          </div>
        ))}
      </dl>
    </section>
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
    <div className="max-w-4xl mx-auto px-6 pt-6 pb-36 md:pb-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-[18px] leading-6 font-semibold text-foreground">API playground</h1>
        <p className="text-[12px] text-muted-foreground max-w-xl">
          Call the L1Beat REST and WebSocket API from the browser. No key needed.
        </p>
        <p className="text-[12px] text-muted-foreground max-w-xl">
          EVM, DeFi and ICM data cover the Avalanche C-Chain (chain ID 43114).
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
          <a
            href={PLAYGROUND_OPENAPI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded border border-border text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            OpenAPI spec
            <ExternalLink className="w-3 h-3" aria-hidden />
          </a>
        </div>

        {/* Stats row */}
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground pt-1">
          <div className="flex items-baseline gap-1.5"><dd className="num text-foreground">{REST_ENDPOINTS.length}</dd><dt>REST endpoints</dt></div>
          <div className="flex items-baseline gap-1.5"><dd className="num text-foreground">{WS_ENDPOINTS.length}</dd><dt>WebSocket</dt></div>
          <div className="flex items-baseline gap-1.5"><dt>Open CORS</dt></div>
          <div className="flex items-baseline gap-1.5"><dd className="num text-foreground">180</dd><dt>req/min, burst 30</dt></div>
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

      <UsingTheApi />
    </div>
  );
}
