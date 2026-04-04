import React, { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../branding/ui/collapsible';
import {
  REST_ENDPOINTS,
  WS_ENDPOINTS,
  ENDPOINT_CATEGORIES,
  EndpointDef,
  WsEndpointDef,
} from './endpointCatalog';

const STORAGE_KEY = 'l1beat_playground_sidebar_collapsed';

interface EndpointSidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function MethodBadge({ method }: { method: 'GET' | 'WS' }) {
  if (method === 'WS') {
    return (
      <span className="bg-purple-500/15 text-purple-600 dark:text-purple-400 text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0">
        WS
      </span>
    );
  }
  return (
    <span className="bg-green-500/15 text-green-600 dark:text-green-400 text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0">
      GET
    </span>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return text;
  return (
    <>
      {text.slice(0, index)}
      <strong className="text-foreground font-semibold">
        {text.slice(index, index + query.length)}
      </strong>
      {text.slice(index + query.length)}
    </>
  );
}

function loadCollapsedState(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveCollapsedState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

type AnyEndpoint = (EndpointDef | WsEndpointDef) & { method?: string };

export function EndpointSidebar({ selectedId, onSelect }: EndpointSidebarProps) {
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsedState);

  useEffect(() => {
    saveCollapsedState(collapsed);
  }, [collapsed]);

  const allEndpoints: AnyEndpoint[] = [
    ...REST_ENDPOINTS.map((e) => ({ ...e, method: 'GET' as const })),
    ...WS_ENDPOINTS.map((e) => ({ ...e, method: 'WS' as const })),
  ];

  const q = search.trim();

  if (q) {
    const filtered = allEndpoints.filter(
      (e) =>
        e.title.toLowerCase().includes(q.toLowerCase()) ||
        e.path.toLowerCase().includes(q.toLowerCase()) ||
        e.description.toLowerCase().includes(q.toLowerCase())
    );

    return (
      <div className="flex flex-col h-full">
        <div className="p-3 border-b border-border flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search endpoints..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-[#ef4444] placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2 min-h-0 scrollbar-hide">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground px-4 py-3">No endpoints match.</p>
          ) : (
            filtered.map((endpoint) => {
              const isActive = endpoint.id === selectedId;
              return (
                <button
                  key={endpoint.id}
                  onClick={() => onSelect(endpoint.id)}
                  className={`w-full text-left flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? 'border-l-2 border-[#ef4444] bg-[#ef4444]/5 text-foreground font-medium'
                      : 'border-l-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <MethodBadge method={(endpoint.method as 'GET' | 'WS') ?? 'GET'} />
                  <span className="truncate">{highlightMatch(endpoint.title, q)}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  const endpointsByCategory: Record<string, AnyEndpoint[]> = {};
  for (const cat of ENDPOINT_CATEGORIES) {
    endpointsByCategory[cat] = allEndpoints.filter((e) => e.category === cat);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search endpoints..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-[#ef4444] placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2 min-h-0 scrollbar-hide">
        {ENDPOINT_CATEGORIES.map((category) => {
          const endpoints = endpointsByCategory[category] ?? [];
          if (endpoints.length === 0) return null;
          const isOpen = !collapsed[category];
          const count = endpoints.length;

          return (
            <Collapsible
              key={category}
              open={isOpen}
              onOpenChange={(open) => {
                setCollapsed((prev) => ({ ...prev, [category]: !open }));
              }}
            >
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
                  <span className="flex items-center gap-1.5">
                    {isOpen ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    {category}
                    {!isOpen && (
                      <span className="text-muted-foreground font-normal normal-case tracking-normal">
                        ({count})
                      </span>
                    )}
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                {endpoints.map((endpoint) => {
                  const isActive = endpoint.id === selectedId;
                  return (
                    <button
                      key={endpoint.id}
                      onClick={() => onSelect(endpoint.id)}
                      className={`w-full text-left flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                        isActive
                          ? 'border-l-2 border-[#ef4444] bg-[#ef4444]/5 text-foreground font-medium'
                          : 'border-l-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <MethodBadge method={(endpoint.method as 'GET' | 'WS') ?? 'GET'} />
                      <span className="truncate text-xs">{endpoint.title}</span>
                    </button>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
