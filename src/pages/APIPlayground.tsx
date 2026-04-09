import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X, GripVertical } from 'lucide-react';

import {
  REST_ENDPOINTS,
  WS_ENDPOINTS,
  getEndpointById,
  isWsEndpoint,
  buildDefaults,
  EndpointDef,
} from '../components/playground/endpointCatalog';
import { EndpointSidebar } from '../components/playground/EndpointSidebar';
import { LandingState } from '../components/playground/LandingState';
import { RequestPanel } from '../components/playground/RequestPanel';
import { ResponsePanel } from '../components/playground/ResponsePanel';
import { WebSocketPanel } from '../components/playground/WebSocketPanel';
import { HistoryBar, HistoryEntry } from '../components/playground/HistoryBar';
import { ChainOption } from '../components/playground/SmartParamInput';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { PLAYGROUND_API_BASE } from '../components/playground/constants';

const BASE_URL = PLAYGROUND_API_BASE;
const HISTORY_STORAGE_KEY = 'l1beat_playground_history';
const MAX_HISTORY = 20;
const CARRY_OVER_PARAMS = ['chainId', 'limit', 'offset', 'subnet_id'];

// ─── Drag-to-resize hook ──────────────────────────────────────────────────────

function useDragResize(
  initialPct: number,
  minPct: number,
  maxPct: number,
  storageKey?: string
): [number, (e: React.MouseEvent, container: HTMLElement) => void] {
  const [pct, setPct] = useState(() => {
    if (storageKey) {
      try {
        const s = localStorage.getItem(storageKey);
        if (s) return Math.max(minPct, Math.min(maxPct, parseFloat(s)));
      } catch { /* ignore */ }
    }
    return initialPct;
  });

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent, container: HTMLElement) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const onMove = (ev: MouseEvent) => {
        const newPct = Math.max(
          minPct,
          Math.min(maxPct, ((ev.clientX - rect.left) / rect.width) * 100)
        );
        setPct(newPct);
        if (storageKey) {
          try { localStorage.setItem(storageKey, String(newPct)); } catch { /* ignore */ }
        }
      };
      const onUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [minPct, maxPct, storageKey]
  );

  return [pct, onHandleMouseDown];
}

// ─── DragHandle component ─────────────────────────────────────────────────────

function DragHandle({
  onMouseDown,
}: {
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="relative flex-shrink-0 w-1 bg-border cursor-col-resize hover:bg-[#ef4444]/40 active:bg-[#ef4444]/60 transition-colors duration-150 group flex items-center justify-center"
    >
      <div className="absolute flex items-center justify-center w-3 h-4 rounded-sm bg-background border border-border/60 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
        <GripVertical className="w-2.5 h-2.5 text-muted-foreground" />
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadHistory(): HistoryEntry[] {
  try {
    const stored = sessionStorage.getItem(HISTORY_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch { /* ignore */ }
}

function buildUrl(endpointPath: string, params: Record<string, string>): string {
  let path = endpointPath;
  path = path.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const val = params[key];
    return val ? encodeURIComponent(val) : `{${key}}`;
  });
  const endpoint = REST_ENDPOINTS.find((e) => e.path === endpointPath);
  if (!endpoint) return BASE_URL + path;
  const queryParams = endpoint.params.filter((p) => p.kind === 'query');
  const qs = new URLSearchParams();
  for (const param of queryParams) {
    const val = params[param.name];
    if (val && val !== '') qs.append(param.name, val);
  }
  const queryString = qs.toString();
  return BASE_URL + path + (queryString ? `?${queryString}` : '');
}

function buildCurl(url: string): string {
  return `curl "${url}"`;
}


function getValidationErrors(
  endpoint: EndpointDef,
  params: Record<string, string>
): Record<string, boolean> {
  const errors: Record<string, boolean> = {};
  for (const param of endpoint.params) {
    if (param.required && !params[param.name]) {
      errors[param.name] = true;
    }
  }
  return errors;
}

// ─── APIPlayground ────────────────────────────────────────────────────────────

export function APIPlayground() {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const mainSplitRef = useRef<HTMLDivElement>(null);
  const reqResSplitRef = useRef<HTMLDivElement>(null);

  const [sidebarPct, onSidebarHandleMouseDown] = useDragResize(22, 14, 36, 'l1beat-playground-sidebar');
  const [reqPct, onReqResHandleMouseDown] = useDragResize(38, 24, 58, 'l1beat-playground-reqres');

  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('endpoint'));
  const [params, setParams] = useState<Record<string, string>>(() => {
    const id = searchParams.get('endpoint');
    const endpoint = id ? getEndpointById(id) : null;
    if (!endpoint) return {};
    const defaults = buildDefaults(endpoint);
    const merged = { ...defaults };
    searchParams.forEach((value, key) => {
      if (key !== 'endpoint') merged[key] = value;
    });
    return merged;
  });

  const [response, setResponse] = useState<unknown | null>(null);
  const [cumulativeData, setCumulativeData] = useState<unknown[]>([]);
  const [status, setStatus] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chains, setChains] = useState<ChainOption[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'request' | 'response'>('request');

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dynamic height: fill from top of wrapper to bottom of viewport
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const top = el.getBoundingClientRect().top;
      el.style.height = `${window.innerHeight - top}px`;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Fetch available chains
  useEffect(() => {
    fetch(`${BASE_URL}/api/v1/data/chains?chain_type=l1&active=true&limit=100`)
      .then((r) => r.json())
      .then((data: { data: Array<{ evm_chain_id?: number; name?: string; logo_url?: string }> }) => {
        const opts: ChainOption[] = data.data
          .filter((c) => c.evm_chain_id != null)
          .map((c) => ({
            evmChainId: c.evm_chain_id!,
            name: c.name ?? String(c.evm_chain_id),
            logoUrl: c.logo_url,
          }));
        if (!opts.find((o) => o.evmChainId === 43114)) {
          opts.unshift({ evmChainId: 43114, name: 'Avalanche C-Chain' });
        }
        setChains(opts);
      })
      .catch(() => {
        setChains([{ evmChainId: 43114, name: 'Avalanche C-Chain' }]);
      });
  }, []);

  // Switch to response tab on mobile when response arrives
  useEffect(() => {
    if (response !== null && !isLoading) {
      setMobileTab('response');
    }
  }, [response, isLoading]);

  // Sync URL (debounced)
  useEffect(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      const newParams = new URLSearchParams();
      if (selectedId) {
        newParams.set('endpoint', selectedId);
        Object.entries(params).forEach(([k, v]) => {
          if (v && v !== '') newParams.set(k, v);
        });
      }
      setSearchParams(newParams, { replace: true });
    }, 300);
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [selectedId, params, setSearchParams]);

  // Keyboard shortcut ref — populated after handleExecute is defined below
  const handleExecuteRef = useRef<() => void>(() => {});

  const handleParamChange = useCallback((name: string, value: string) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleEndpointSelect = useCallback(
    (id: string) => {
      const endpoint = getEndpointById(id);
      if (!endpoint) return;
      const defaults = buildDefaults(endpoint);
      const newParams = { ...defaults };
      for (const key of CARRY_OVER_PARAMS) {
        if (params[key] && params[key] !== '') {
          if (endpoint.params.some((p) => p.name === key)) {
            newParams[key] = params[key];
          }
        }
      }
      setSelectedId(id);
      setParams(newParams);
      setResponse(null);
      setCumulativeData([]);
      setStatus(null);
      setDurationMs(null);
      setNetworkError(null);
      setMobileTab('request');
    },
    [params]
  );

  const handleExecuteWithParams = useCallback(
    async (overrideParams: Record<string, string>) => {
      if (!selectedId || isWsEndpoint(selectedId)) return;
      const endpoint = REST_ENDPOINTS.find((e) => e.id === selectedId);
      if (!endpoint) return;
      // Strip cursor so a fresh execute always starts from page 1
      const cleanParams = { ...overrideParams };
      delete cleanParams['cursor'];
      if (Object.keys(getValidationErrors(endpoint, cleanParams)).length > 0) return;

      const url = buildUrl(endpoint.path, cleanParams);
      setParams((prev) => { const p = { ...prev }; delete p['cursor']; return p; });
      setIsLoading(true);
      setNetworkError(null);
      setResponse(null);
      setCumulativeData([]);
      setStatus(null);

      const startTime = performance.now();
      try {
        const res = await fetch(url);
        const elapsed = Math.round(performance.now() - startTime);
        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          json = { error: { message: 'Response body was not valid JSON' } };
        }
        const freshData = Array.isArray((json as Record<string, unknown>)?.data)
          ? (json as Record<string, unknown>).data as unknown[]
          : [];
        setCumulativeData(freshData);
        setResponse(json);
        setStatus(res.status);
        setDurationMs(elapsed);
        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          endpointId: selectedId,
          url,
          status: res.status,
          durationMs: elapsed,
          timestamp: Date.now(),
          response: json,
        };
        setHistory((prev) => {
          const next = [entry, ...prev].slice(0, MAX_HISTORY);
          saveHistory(next);
          return next;
        });
      } catch (err) {
        const elapsed = Math.round(performance.now() - startTime);
        setDurationMs(elapsed);
        setNetworkError(err instanceof Error ? err.message : 'An unknown network error occurred.');
      } finally {
        setIsLoading(false);
      }
    },
    [selectedId]
  );

  const handleExecute = useCallback(() => {
    handleExecuteWithParams(params);
  }, [handleExecuteWithParams, params]);

  // Keep ref current so the keyboard handler below never captures a stale closure
  useEffect(() => { handleExecuteRef.current = handleExecute; }, [handleExecute]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (selectedId && !isWsEndpoint(selectedId)) handleExecuteRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  const handleFeaturedSelect = useCallback(
    (endpointId: string, featuredParams: Record<string, string>) => {
      const endpoint = getEndpointById(endpointId);
      if (!endpoint) return;
      const merged = { ...buildDefaults(endpoint), ...featuredParams };
      setSelectedId(endpointId);
      setParams(merged);
      setResponse(null);
      setStatus(null);
      setDurationMs(null);
      setNetworkError(null);
      setMobileTab('request');

      setCumulativeData([]);
      if (!isWsEndpoint(endpointId)) {
        const restEndpoint = REST_ENDPOINTS.find((e) => e.id === endpointId);
        if (restEndpoint) {
          const url = buildUrl(restEndpoint.path, merged);
          setIsLoading(true);
          const startTime = performance.now();
          fetch(url)
            .then(async (res) => {
              const elapsed = Math.round(performance.now() - startTime);
              let json: unknown = null;
              try { json = await res.json(); } catch { json = { error: { message: 'Response body was not valid JSON' } }; }
              const freshData = Array.isArray((json as Record<string, unknown>)?.data)
                ? (json as Record<string, unknown>).data as unknown[]
                : [];
              setCumulativeData(freshData);
              setResponse(json);
              setStatus(res.status);
              setDurationMs(elapsed);
              const entry: HistoryEntry = { id: crypto.randomUUID(), endpointId, url, status: res.status, durationMs: elapsed, timestamp: Date.now(), response: json };
              setHistory((prev) => { const next = [entry, ...prev].slice(0, MAX_HISTORY); saveHistory(next); return next; });
            })
            .catch((err) => { const elapsed = Math.round(performance.now() - startTime); setDurationMs(elapsed); setNetworkError(err instanceof Error ? err.message : 'Network error'); })
            .finally(() => setIsLoading(false));
        }
      }
    },
    []
  );

  const handleHistorySelect = useCallback((entry: HistoryEntry) => {
    const endpoint = getEndpointById(entry.endpointId);
    if (!endpoint) return;
    setSelectedId(entry.endpointId);
    try {
      const url = new URL(entry.url);
      const restoredParams: Record<string, string> = buildDefaults(endpoint);
      url.searchParams.forEach((value, key) => { restoredParams[key] = value; });
      const pathSegments = endpoint.path.split('/');
      const urlSegments = url.pathname.split('/');
      pathSegments.forEach((seg, i) => {
        if (seg.startsWith('{') && seg.endsWith('}')) {
          restoredParams[seg.slice(1, -1)] = urlSegments[i] ?? '';
        }
      });
      setParams(restoredParams);
    } catch {
      setParams(buildDefaults(endpoint));
    }
    setResponse(entry.response);
    setStatus(entry.status);
    setDurationMs(entry.durationMs);
    setNetworkError(null);
  }, []);

  const handleHistoryClear = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  const handleLoadNextPage = useCallback(async () => {
    if (!selectedId || isWsEndpoint(selectedId)) return;
    if (isLoading) return;
    const endpoint = REST_ENDPOINTS.find((e) => e.id === selectedId);
    if (!endpoint) return;
    const meta = (response as Record<string, unknown>)?.meta as Record<string, unknown> | undefined;
    if (!meta?.next_cursor) return;

    const newParams = { ...params, cursor: String(meta.next_cursor) };
    setParams(newParams);
    const url = buildUrl(endpoint.path, newParams);
    setIsLoading(true);
    const startTime = performance.now();
    try {
      const res = await fetch(url);
      const elapsed = Math.round(performance.now() - startTime);
      let json: unknown = null;
      try { json = await res.json(); } catch { json = { error: { message: 'Response body was not valid JSON' } }; }
      const newItems = Array.isArray((json as Record<string, unknown>)?.data)
        ? (json as Record<string, unknown>).data as unknown[]
        : [];
      setCumulativeData((prev) => [...prev, ...newItems]);
      // Update response meta/cursor but keep cumulative data as the displayed data
      setResponse(json);
      setStatus(res.status);
      setDurationMs(elapsed);
    } catch (err) {
      const elapsed = Math.round(performance.now() - startTime);
      setDurationMs(elapsed);
      setNetworkError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsLoading(false);
    }
  }, [response, params, selectedId, isLoading]);

  const handleRetryAfter = useCallback(() => {
    handleExecute();
  }, [handleExecute]);

  // Merge cumulative data into the display response so the JSON viewer shows all loaded items
  const displayResponse: unknown = (() => {
    if (!response || cumulativeData.length === 0) return response;
    const r = response as Record<string, unknown>;
    if (!Array.isArray(r.data)) return response;
    return { ...r, data: cumulativeData };
  })();

  // Derived state
  const currentEndpoint = selectedId ? REST_ENDPOINTS.find((e) => e.id === selectedId) : null;
  const constructedUrl = currentEndpoint ? buildUrl(currentEndpoint.path, params) : '';
  const curlSnippet = constructedUrl ? buildCurl(constructedUrl) : '';
  const validationErrors = currentEndpoint ? getValidationErrors(currentEndpoint, params) : {};
  const hasValidationErrors = Object.keys(validationErrors).length > 0;
  const suggestedNext: EndpointDef[] = currentEndpoint?.suggestedNext
    ? currentEndpoint.suggestedNext.map((id) => REST_ENDPOINTS.find((e) => e.id === id)).filter((e): e is EndpointDef => e != null)
    : [];
  const hasNextPage = (() => {
    if (!response) return false;
    const meta = (response as Record<string, unknown>)?.meta as Record<string, unknown> | undefined;
    return Boolean(meta?.next_cursor);
  })();

  const wsEndpoint = selectedId ? WS_ENDPOINTS.find((e) => e.id === selectedId) : undefined;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      className="flex flex-col bg-background text-foreground overflow-hidden"
    >
      {/* Mobile sidebar drawer */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            <motion.aside
              className="fixed left-0 top-0 h-full w-72 bg-background border-r border-border z-50 flex flex-col md:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.22 }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                <span className="font-medium text-sm">Endpoints</span>
                <button
                  onClick={() => setIsMobileSidebarOpen(false)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <EndpointSidebar
                  selectedId={selectedId}
                  onSelect={(id) => {
                    handleEndpointSelect(id);
                    setIsMobileSidebarOpen(false);
                  }}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {isDesktop ? (
        /* ── Desktop: custom drag-split layout ── */
        <>
          <div ref={mainSplitRef} className="flex flex-row flex-1 min-h-0 overflow-hidden">
            {/* Sidebar */}
            <div
              style={{ width: `${sidebarPct}%` }}
              className="flex-shrink-0 flex flex-col overflow-hidden border-r border-border"
            >
              <EndpointSidebar selectedId={selectedId} onSelect={handleEndpointSelect} />
            </div>

            {/* Sidebar drag handle */}
            <DragHandle
              onMouseDown={(e) => {
                if (mainSplitRef.current) onSidebarHandleMouseDown(e, mainSplitRef.current);
              }}
            />

            {/* Main content */}
            <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              {!selectedId ? (
                <div className="flex-1 overflow-y-auto">
                  <LandingState onSelect={handleFeaturedSelect} />
                </div>
              ) : isWsEndpoint(selectedId) ? (
                <div className="flex-1 overflow-y-auto">
                  {wsEndpoint && (
                    <WebSocketPanel
                      endpoint={wsEndpoint}
                      params={params}
                      onParamChange={handleParamChange}
                      chains={chains}
                    />
                  )}
                </div>
              ) : currentEndpoint ? (
                <div ref={reqResSplitRef} className="flex flex-row flex-1 min-h-0 overflow-hidden">
                  {/* Request panel */}
                  <div
                    style={{ width: `${reqPct}%` }}
                    className="flex-shrink-0 flex flex-col overflow-hidden border-r border-border"
                  >
                    <RequestPanel
                      endpoint={currentEndpoint}
                      params={params}
                      onParamChange={handleParamChange}
                      onExecute={handleExecute}
                      isLoading={isLoading}
                      constructedUrl={constructedUrl}
                      curlSnippet={curlSnippet}

                      chains={chains}
                      hasValidationErrors={hasValidationErrors}
                      validationErrors={validationErrors}
                    />
                  </div>

                  {/* Request/response drag handle */}
                  <DragHandle
                    onMouseDown={(e) => {
                      if (reqResSplitRef.current) onReqResHandleMouseDown(e, reqResSplitRef.current);
                    }}
                  />

                  {/* Response panel */}
                  <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                    <ResponsePanel
                      response={displayResponse}
                      status={status}
                      durationMs={durationMs}
                      networkError={networkError}
                      isLoading={isLoading}
                      onLoadNextPage={hasNextPage ? handleLoadNextPage : null}
                      suggestedNext={suggestedNext}
                      onSuggestSelect={handleEndpointSelect}
                      onRetryAfter={handleRetryAfter}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <HistoryBar
            history={history}
            onSelect={handleHistorySelect}
            onClear={handleHistoryClear}
          />
        </>
      ) : (
        /* ── Mobile: stacked layout with tabs ── */
        <>
          {!selectedId ? (
            <div className="flex-1 overflow-y-auto">
              <LandingState onSelect={handleFeaturedSelect} />
            </div>
          ) : isWsEndpoint(selectedId) ? (
            <div className="flex-1 overflow-y-auto">
              {wsEndpoint && (
                <WebSocketPanel
                  endpoint={wsEndpoint}
                  params={params}
                  onParamChange={handleParamChange}
                  chains={chains}
                />
              )}
            </div>
          ) : currentEndpoint ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Mobile tab bar */}
              <div className="flex border-b border-border bg-muted/30 flex-shrink-0">
                <button
                  onClick={() => setMobileTab('request')}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    mobileTab === 'request'
                      ? 'text-foreground border-b-2 border-[#ef4444]'
                      : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
                  }`}
                >
                  Request
                </button>
                <button
                  onClick={() => setMobileTab('response')}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors relative ${
                    mobileTab === 'response'
                      ? 'text-foreground border-b-2 border-[#ef4444]'
                      : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
                  }`}
                >
                  Response
                  {status !== null && (
                    <span
                      className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                        status >= 400 ? 'bg-red-500' : 'bg-green-500'
                      }`}
                    />
                  )}
                </button>
              </div>

              {/* Tab content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {mobileTab === 'request' ? (
                  <div className="h-full overflow-y-auto">
                    <RequestPanel
                      endpoint={currentEndpoint}
                      params={params}
                      onParamChange={handleParamChange}
                      onExecute={handleExecute}
                      isLoading={isLoading}
                      constructedUrl={constructedUrl}
                      curlSnippet={curlSnippet}

                      chains={chains}
                      hasValidationErrors={hasValidationErrors}
                      validationErrors={validationErrors}
                      scrollable={false}
                    />
                  </div>
                ) : (
                  <div className="h-full overflow-hidden flex flex-col">
                    <ResponsePanel
                      response={displayResponse}
                      status={status}
                      durationMs={durationMs}
                      networkError={networkError}
                      isLoading={isLoading}
                      onLoadNextPage={hasNextPage ? handleLoadNextPage : null}
                      suggestedNext={suggestedNext}
                      onSuggestSelect={handleEndpointSelect}
                      onRetryAfter={handleRetryAfter}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <HistoryBar
            history={history}
            onSelect={handleHistorySelect}
            onClear={handleHistoryClear}
          />

          {/* Floating endpoint picker */}
          <button
            className="fixed bottom-16 left-4 z-30 flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-full text-sm font-medium shadow-lg hover:border-[#ef4444]/40 transition-colors"
            onClick={() => setIsMobileSidebarOpen(true)}
          >
            <Menu className="w-4 h-4" />
            Endpoints
          </button>
        </>
      )}
    </div>
  );
}
