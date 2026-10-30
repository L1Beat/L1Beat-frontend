import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy } from 'lucide-react';
import { useToast } from './Toaster';
import { shortNodeId } from '../utils/nodeId';

/**
 * A shortened node ID with a copy button that copies the full ID. Works inside
 * clickable rows: the button doesn't trigger the row.
 */
export function NodeId({ id, to, className = '' }: { id: string; to?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();
  const { toast } = useToast();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Failed to copy to clipboard', 'error');
    }
  };

  const label = shortNodeId(id);
  return (
    <span className={`inline-flex items-center gap-1 min-w-0 ${className}`}>
      {to ? (
        <Link to={to} title={id} className="num text-foreground hover:underline underline-offset-2 truncate">
          {label}
        </Link>
      ) : (
        <span title={id} className="num text-foreground truncate">{label}</span>
      )}
      <button
        type="button"
        onClick={copy}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={copied ? 'Node ID copied' : `Copy node ID ${id}`}
        title={copied ? 'Copied' : 'Copy node ID'}
        className={`shrink-0 inline-flex items-center justify-center w-5 h-5 rounded transition-colors hover:bg-accent focus-visible:opacity-100 ${
          copied ? 'text-up' : 'text-muted-foreground/60 hover:text-foreground'
        }`}
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      </button>
    </span>
  );
}
