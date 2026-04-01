import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../branding/ui/collapsible';

export interface HistoryEntry {
  id: string;
  endpointId: string;
  url: string;
  status: number;
  durationMs: number;
  timestamp: number;
  response: unknown;
}

interface HistoryBarProps {
  history: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
}

const STORAGE_KEY = 'l1beat_playground_history_open';

function StatusBadge({ status }: { status: number }) {
  const color =
    status >= 500
      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
      : status >= 400
      ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400'
      : 'bg-green-500/15 text-green-600 dark:text-green-400';
  return (
    <span className={`text-xs font-mono px-1.5 py-0.5 rounded flex-shrink-0 ${color}`}>
      {status}
    </span>
  );
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

const BASE_URL = 'https://api.l1beat.io';

function shortenedPath(url: string): string {
  const path = url.startsWith(BASE_URL) ? url.slice(BASE_URL.length) : url;
  const [pathPart, queryPart] = path.split('?');
  if (!queryPart) return pathPart;
  // Truncate long query strings
  const shortQuery = queryPart.length > 40 ? queryPart.slice(0, 40) + '...' : queryPart;
  return `${pathPart}?${shortQuery}`;
}

function loadOpenState(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function HistoryBar({ history, onSelect, onClear }: HistoryBarProps) {
  const [open, setOpen] = useState(loadOpenState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, [open]);

  return (
    <div className="border-t border-border bg-background flex-shrink-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-6 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium">
              History
              {history.length > 0 && (
                <span className="ml-1 text-muted-foreground font-normal">
                  ({history.length})
                </span>
              )}
            </span>
            <span className="ml-auto">
              {open ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {history.length === 0 ? (
            <div className="px-6 pb-3 text-xs text-muted-foreground">
              No history yet. Execute a request to see it here.
            </div>
          ) : (
            <div className="flex items-center gap-2 px-6 pb-3 overflow-x-auto scrollbar-hide">
              {history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onSelect(entry)}
                  className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border border-border hover:border-[#ef4444]/30 bg-card text-xs whitespace-nowrap transition-colors"
                  style={{ boxShadow: 'var(--card-shadow)' }}
                >
                  <span className="font-mono text-muted-foreground truncate max-w-[200px]">
                    {shortenedPath(entry.url)}
                  </span>
                  <StatusBadge status={entry.status} />
                  <span className="text-muted-foreground">{entry.durationMs}ms</span>
                  <span className="text-muted-foreground">{relativeTime(entry.timestamp)}</span>
                </button>
              ))}
              <button
                onClick={onClear}
                className="flex-shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 whitespace-nowrap"
              >
                Clear all
              </button>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
