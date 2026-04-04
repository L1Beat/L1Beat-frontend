import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal, AlertCircle, Copy, ChevronRight, ChevronDown } from 'lucide-react';
import { Skeleton } from '../branding/ui/skeleton';
import { EndpointDef } from './endpointCatalog';

// ─── StatusBadge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: number }) {
  const color =
    status >= 500
      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
      : status >= 400
      ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
      : status >= 300
      ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
      : 'bg-green-500/15 text-green-600 dark:text-green-400';
  const label =
    status >= 500
      ? `${status} Error`
      : status >= 400
      ? `${status} Error`
      : `${status} OK`;
  return (
    <span
      className={`text-xs font-mono font-medium px-2 py-0.5 rounded-full ${color}`}
    >
      {label}
    </span>
  );
}

// ─── Rate Limit Card ────────────────────────────────────────────────────────

function RateLimitCard({
  retryAfter,
  onRetry,
}: {
  retryAfter: number;
  onRetry: () => void;
}) {
  const [seconds, setSeconds] = useState(retryAfter);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (seconds <= 0) {
      if (!cancelledRef.current) onRetry();
      return;
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds, onRetry]);

  return (
    <div className="m-6 p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
      <div className="font-medium text-orange-700 dark:text-orange-400 mb-2">
        Rate Limited
      </div>
      <p className="text-sm text-foreground mb-3">
        Retrying in{' '}
        <span className="font-mono font-bold">{seconds}s</span>...
      </p>
      <button
        onClick={() => {
          cancelledRef.current = true;
          setSeconds(0);
        }}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        Cancel auto-retry
      </button>
    </div>
  );
}

// ─── JSON Viewer ─────────────────────────────────────────────────────────────

interface ExpandSignals {
  expandSig: number;
  collapseSig: number;
  generation: number;
}
const ExpandContext = React.createContext<ExpandSignals>({ expandSig: 0, collapseSig: 0, generation: 0 });

interface JsonNodeProps {
  value: unknown;
  depth: number;
}

function JsonNode({ value, depth }: JsonNodeProps) {
  const { expandSig, collapseSig, generation } = React.useContext(ExpandContext);
  const isArray = Array.isArray(value);
  const isObject =
    value !== null && typeof value === 'object' && !isArray;
  const isComplex = isArray || isObject;

  const defaultOpen = isComplex;
  const [open, setOpen] = useState(defaultOpen);

  // Reset to default when a new response arrives
  const prevGenRef = useRef(generation);
  useEffect(() => {
    if (prevGenRef.current !== generation) {
      prevGenRef.current = generation;
      setOpen(defaultOpen);
    }
  }, [generation, defaultOpen]);

  // Expand all signal
  const prevExpandSig = useRef(expandSig);
  useEffect(() => {
    if (prevExpandSig.current !== expandSig) {
      prevExpandSig.current = expandSig;
      if (isComplex) setOpen(true);
    }
  }, [expandSig, isComplex]);

  // Collapse all signal
  const prevCollapseSig = useRef(collapseSig);
  useEffect(() => {
    if (prevCollapseSig.current !== collapseSig) {
      prevCollapseSig.current = collapseSig;
      if (isComplex) setOpen(false);
    }
  }, [collapseSig, isComplex]);

  const indent = { paddingLeft: `${depth * 16}px` };

  if (value === null) {
    return <span className="text-[#c084fc]">null</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="text-[#c084fc]">{value ? 'true' : 'false'}</span>;
  }

  if (typeof value === 'number') {
    return <span className="text-[#fb923c]">{value}</span>;
  }

  if (typeof value === 'string') {
    return <span className="text-[#4ade80]">{JSON.stringify(value)}</span>;
  }

  if (isArray) {
    const arr = value as unknown[];
    if (arr.length === 0) {
      return <span className="text-muted-foreground">[]</span>;
    }

    if (!open) {
      return (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity"
        >
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">
            Array [{arr.length} items]
          </span>
        </button>
      );
    }

    return (
      <span>
        <button
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-0.5 hover:opacity-70 transition-opacity"
        >
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
        <span className="text-muted-foreground">[</span>
        {arr.map((item, i) => (
          <div key={i} style={indent}>
            <JsonNode value={item} depth={depth + 1} />
            {i < arr.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
        <div style={{ paddingLeft: `${(depth) * 16}px` }}>
          <span className="text-muted-foreground">]</span>
        </div>
      </span>
    );
  }

  if (isObject) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return <span className="text-muted-foreground">{'{}'}</span>;
    }

    if (!open) {
      return (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 hover:opacity-70 transition-opacity"
        >
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground text-xs">
            Object {'{'}
            {keys.length} keys{'}'}
          </span>
        </button>
      );
    }

    return (
      <span>
        <button
          onClick={() => setOpen(false)}
          className="inline-flex items-center gap-0.5 hover:opacity-70 transition-opacity"
        >
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
        <span className="text-muted-foreground">{'{'}</span>
        {keys.map((key, i) => (
          <div key={key} style={indent}>
            <span className="text-[#60a5fa]">{JSON.stringify(key)}</span>
            <span className="text-muted-foreground">: </span>
            <JsonNode value={obj[key]} depth={depth + 1} />
            {i < keys.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
        <div style={{ paddingLeft: `${(depth) * 16}px` }}>
          <span className="text-muted-foreground">{'}'}</span>
        </div>
      </span>
    );
  }

  return <span className="text-muted-foreground">{String(value)}</span>;
}

// ─── ResponsePanel ────────────────────────────────────────────────────────────

interface ResponsePanelProps {
  response: unknown | null;
  status: number | null;
  durationMs: number | null;
  networkError: string | null;
  isLoading: boolean;
  onLoadNextPage: (() => void) | null;
  suggestedNext: EndpointDef[];
  onSuggestSelect: (id: string) => void;
  onRetryAfter?: (seconds: number) => void;
}

function countLines(data: unknown): number {
  try {
    return JSON.stringify(data, null, 2).split('\n').length;
  } catch {
    return 0;
  }
}

export function ResponsePanel({
  response,
  status,
  durationMs,
  networkError,
  isLoading,
  onLoadNextPage,
  suggestedNext,
  onSuggestSelect,
  onRetryAfter,
}: ResponsePanelProps) {
  const [copiedJson, setCopiedJson] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [expandSig, setExpandSig] = useState(0);
  const [collapseSig, setCollapseSig] = useState(0);

  const copyJson = useCallback(() => {
    try {
      navigator.clipboard.writeText(JSON.stringify(response, null, 2)).then(() => {
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 1500);
      });
    } catch {
      // ignore
    }
  }, [response]);

  const expandAll = () => setExpandSig((s) => s + 1);
  const collapseAll = () => setCollapseSig((s) => s + 1);

  // Reset to default open state when a new response arrives
  const prevResponseRef = useRef(response);
  useEffect(() => {
    if (prevResponseRef.current !== response) {
      prevResponseRef.current = response;
      setGeneration((g) => g + 1);
    }
  }, [response]);

  // Empty state
  if (!isLoading && response === null && !networkError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-6">
        <Terminal className="w-10 h-10 opacity-30" />
        <p className="text-sm">Execute a request to see the response</p>
        <p className="text-xs opacity-60">
          {typeof navigator !== 'undefined' &&
          (navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac'))
            ? '⌘↵ to run'
            : 'Ctrl+↵ to run'}
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-4 w-12" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }

  // Network error
  if (networkError) {
    return (
      <div className="m-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400">
        <div className="flex items-center gap-2 font-medium mb-1">
          <AlertCircle className="w-4 h-4" />
          Network Error
        </div>
        <p className="text-sm font-mono">{networkError}</p>
      </div>
    );
  }

  if (response === null || status === null) return null;

  // Rate limit handling
  if (status === 429 && onRetryAfter) {
    const body = response as Record<string, unknown>;
    const retryAfter =
      typeof body?.retry_after === 'number' ? body.retry_after : 10;
    return (
      <RateLimitCard
        retryAfter={retryAfter}
        onRetry={() => onRetryAfter(retryAfter)}
      />
    );
  }

  // Error card for 4xx/5xx
  if (status >= 400) {
    const errorBody = response as Record<string, unknown>;
    const err = errorBody?.error as Record<string, unknown> | undefined;

    if (err) {
      return (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Summary bar */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 flex-wrap gap-y-2">
            <StatusBadge status={status} />
            {durationMs !== null && (
              <span className="text-sm text-muted-foreground">{durationMs}ms</span>
            )}
          </div>
          <div className="m-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            {err.code && (
              <div className="font-mono text-sm font-medium text-yellow-700 dark:text-yellow-400 mb-2">
                {String(err.code)}
              </div>
            )}
            {err.message && (
              <div className="text-sm text-foreground mb-1">
                {String(err.message)}
              </div>
            )}
            {err.details && (
              <div className="text-xs text-muted-foreground font-mono">
                {String(err.details)}
              </div>
            )}
          </div>
        </div>
      );
    }
  }

  // Success response
  const responseObj = response as Record<string, unknown> | unknown[];
  const meta = !Array.isArray(responseObj)
    ? (responseObj?.meta as Record<string, unknown> | undefined)
    : undefined;
  const dataField = !Array.isArray(responseObj) ? responseObj?.data : responseObj;
  const lineCount = countLines(response);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Summary bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 flex-wrap gap-y-2 flex-shrink-0">
        <StatusBadge status={status} />
        {durationMs !== null && (
          <span className="text-sm text-muted-foreground">{durationMs}ms</span>
        )}
        {Array.isArray(dataField) && (
          <span className="text-sm text-muted-foreground">
            {dataField.length} results
          </span>
        )}
        {meta?.total != null && (
          <span className="text-sm text-muted-foreground">
            {Number(meta.total).toLocaleString()} total
          </span>
        )}
        {meta?.has_more && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
            has more
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{lineCount} lines</span>
          <button
            onClick={expandAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Collapse all
          </button>
          <button
            onClick={copyJson}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Copy className="w-3.5 h-3.5" />
            {copiedJson ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>

      {/* JSON Viewer */}
      <div className="flex-1 overflow-auto scrollbar-hide">
        <pre className="font-mono text-xs leading-relaxed p-6">
          <ExpandContext.Provider value={{ expandSig, collapseSig, generation }}>
            <JsonNode value={response} depth={0} />
          </ExpandContext.Provider>
        </pre>

        {/* Load More — inline at the bottom of the data */}
        {onLoadNextPage && (
          <div className="px-6 pb-6">
            <button
              onClick={onLoadNextPage}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-border hover:border-[#ef4444]/50 hover:bg-[#ef4444]/5 text-sm text-muted-foreground hover:text-foreground transition-all duration-150"
            >
              <ChevronRight className="w-3.5 h-3.5" />
              Load more results
            </button>
          </div>
        )}
      </div>

      {/* Suggested follow-ups */}
      {suggestedNext.length > 0 && (
        <div className="px-6 py-4 border-t border-border flex-shrink-0">
          <p className="text-xs text-muted-foreground mb-2">Try next</p>
          <div className="flex flex-wrap gap-2">
            {suggestedNext.map((e) => (
              <button
                key={e.id}
                onClick={() => onSuggestSelect(e.id)}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-[#ef4444]/50 hover:bg-[#ef4444]/5 text-muted-foreground hover:text-foreground transition-all"
              >
                {e.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
