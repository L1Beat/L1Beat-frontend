import React, { useState, useEffect } from 'react';
import { Bookmark, ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../branding/ui/collapsible';
import { REST_ENDPOINTS } from './endpointCatalog';

export interface Bookmark {
  id: string;
  label: string;
  endpointId: string;
  params: Record<string, string>;
  savedAt: number;
}

interface BookmarkBarProps {
  bookmarks: Bookmark[];
  onSelect: (bm: Bookmark) => void;
  onDelete: (id: string) => void;
}

const STORAGE_KEY = 'l1beat_playground_bookmarks_open';

function loadOpenState(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function paramSummary(bm: Bookmark): string {
  const endpoint = REST_ENDPOINTS.find((e) => e.id === bm.endpointId);
  if (!endpoint) return '';
  const parts: string[] = [];
  for (const param of endpoint.params) {
    const v = bm.params[param.name];
    if (v && v !== param.default) {
      parts.push(`${param.name}=${v}`);
    }
  }
  const summary = parts.join(', ');
  return summary.length > 50 ? summary.slice(0, 50) + '…' : summary;
}

export function BookmarkBar({ bookmarks, onSelect, onDelete }: BookmarkBarProps) {
  const [open, setOpen] = useState(loadOpenState);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? 'true' : 'false');
    } catch { /* ignore */ }
  }, [open]);

  if (bookmarks.length === 0) return null;

  return (
    <div className="border-t border-border bg-background flex-shrink-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-2 px-6 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <Bookmark className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium">
              Saved
              <span className="ml-1 text-muted-foreground font-normal">
                ({bookmarks.length})
              </span>
            </span>
            <span className="ml-auto">
              {open ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex items-center gap-2 px-6 pb-3 overflow-x-auto scrollbar-hide">
            {bookmarks.map((bm) => {
              const summary = paramSummary(bm);
              return (
                <div
                  key={bm.id}
                  className="flex-shrink-0 flex items-center gap-1 pl-3 pr-1.5 py-1.5 rounded-full border border-border hover:border-[#ef4444]/30 bg-card text-xs whitespace-nowrap transition-colors group"
                  style={{ boxShadow: 'var(--card-shadow)' }}
                >
                  <button
                    onClick={() => onSelect(bm)}
                    className="flex items-center gap-2 text-left"
                  >
                    <span className="font-medium text-foreground">{bm.label}</span>
                    {summary && (
                      <span className="font-mono text-muted-foreground">{summary}</span>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(bm.id); }}
                    className="ml-1 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                    title="Remove bookmark"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
