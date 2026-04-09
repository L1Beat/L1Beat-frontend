import React, { useState, useCallback } from 'react';
import { Play, Loader2, Copy, Check, Bookmark, BookmarkCheck } from 'lucide-react';
import { EndpointDef, ParamDef } from './endpointCatalog';
import { SmartParamInput } from './SmartParamInput';

interface RequestPanelProps {
  endpoint: EndpointDef;
  params: Record<string, string>;
  onParamChange: (name: string, value: string) => void;
  onExecute: () => void;
  isLoading: boolean;
  constructedUrl: string;
  curlSnippet: string;
  jsSnippet: string;
  pythonSnippet: string;
  hasValidationErrors: boolean;
  validationErrors?: Record<string, boolean>;
  onBookmark: () => void;
  isBookmarked: boolean;
  scrollable?: boolean;
}

function useCopyToClipboard(timeout = 1500) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), timeout);
      });
    },
    [timeout]
  );
  return { copied, copy };
}

function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <button
      onClick={() => copy(text)}
      className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-green-500" />
          <span className="text-green-500">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

function CodeBlock({ label, content }: { label: string; content: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <CopyButton text={content} />
      </div>
      <div className="font-mono text-xs bg-muted rounded-lg p-3 overflow-x-auto scrollbar-hide border border-border">
        <pre className="whitespace-pre-wrap break-all text-foreground">{content}</pre>
      </div>
    </div>
  );
}

function UrlBlock({ url }: { url: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">URL</span>
        <CopyButton text={url} />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block font-mono text-xs bg-muted rounded-lg p-3 overflow-x-auto scrollbar-hide border border-border hover:border-[#ef4444]/40 transition-colors group"
      >
        <pre className="whitespace-pre-wrap break-all text-foreground group-hover:text-[#ef4444]/70 transition-colors duration-150">{url}</pre>
      </a>
    </div>
  );
}

const isMac =
  typeof navigator !== 'undefined' &&
  (navigator.platform.includes('Mac') || navigator.userAgent.includes('Mac'));

const SNIPPET_TAB_KEY = 'l1beat_playground_snippet_tab';

export function RequestPanel({
  endpoint,
  params,
  onParamChange,
  onExecute,
  isLoading,
  constructedUrl,
  curlSnippet,
  jsSnippet,
  pythonSnippet,
  hasValidationErrors,
  validationErrors = {},
  onBookmark,
  isBookmarked,
  scrollable = true,
}: RequestPanelProps) {
  const [snippetTab, setSnippetTab] = React.useState<'curl' | 'js' | 'python'>(() => {
    try {
      const saved = localStorage.getItem(SNIPPET_TAB_KEY);
      if (saved === 'js' || saved === 'python') return saved;
    } catch { /* ignore */ }
    return 'curl';
  });

  const handleSnippetTab = (tab: 'curl' | 'js' | 'python') => {
    setSnippetTab(tab);
    try { localStorage.setItem(SNIPPET_TAB_KEY, tab); } catch { /* ignore */ }
  };
  const pathParams: ParamDef[] = endpoint.params.filter((p) => p.kind === 'path');
  const queryParams: ParamDef[] = endpoint.params.filter((p) => p.kind === 'query');

  const requiredQueryParams = queryParams.filter((p) => p.required);
  const optionalQueryParams = queryParams.filter((p) => !p.required);
  const sortedQueryParams = [...requiredQueryParams, ...optionalQueryParams];

  return (
    <div className={`flex flex-col ${scrollable ? 'h-full overflow-y-auto scrollbar-hide' : ''}`}>
      <div className="p-5 space-y-6">
        {/* Endpoint header */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-green-500/15 text-green-600 dark:text-green-400 text-xs font-mono px-1.5 py-0.5 rounded">
              GET
            </span>
            <code className="text-sm font-mono text-foreground break-all flex-1">
              {endpoint.path}
            </code>
            <button
              onClick={onBookmark}
              title={isBookmarked ? 'Bookmarked' : 'Save bookmark'}
              className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            >
              {isBookmarked
                ? <BookmarkCheck className="w-4 h-4 text-[#ef4444]" />
                : <Bookmark className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-sm text-muted-foreground">{endpoint.description}</p>
          {endpoint.notes && endpoint.notes.length > 0 && (
            <ul className="space-y-1 mt-2">
              {endpoint.notes.map((note) => (
                <li key={note} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-[#ef4444] mt-0.5 flex-shrink-0">•</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Path Parameters */}
        {pathParams.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Path Parameters
              </h3>
              <div className="flex-1 h-px bg-border" />
            </div>
            {pathParams.map((param) => (
              <SmartParamInput
                key={param.name}
                param={param}
                value={params[param.name] ?? param.default ?? ''}
                onChange={(v) => onParamChange(param.name, v)}
                hasError={validationErrors[param.name] ?? false}
              />
            ))}
          </div>
        )}

        {/* Query Parameters */}
        {sortedQueryParams.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Query Parameters
              </h3>
              {requiredQueryParams.length === 0 && (
                <span className="text-xs text-muted-foreground">(optional)</span>
              )}
              <div className="flex-1 h-px bg-border" />
            </div>
            {sortedQueryParams.map((param) => (
              <SmartParamInput
                key={param.name}
                param={param}
                value={params[param.name] ?? param.default ?? ''}
                onChange={(v) => onParamChange(param.name, v)}
                hasError={validationErrors[param.name] ?? false}
              />
            ))}
          </div>
        )}

        {/* Request Preview */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Request Preview
            </h3>
            <div className="flex-1 h-px bg-border" />
          </div>
          <UrlBlock url={constructedUrl} />
          {/* Snippet tab toggle */}
          <div className="space-y-2">
            <div className="flex items-center gap-1">
              {(['curl', 'js', 'python'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleSnippetTab(tab)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                    snippetTab === tab
                      ? 'bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                  }`}
                >
                  {tab === 'js' ? 'fetch' : tab}
                </button>
              ))}
            </div>
            {snippetTab === 'curl' && <CodeBlock label="curl" content={curlSnippet} />}
            {snippetTab === 'js' && <CodeBlock label="javascript" content={jsSnippet} />}
            {snippetTab === 'python' && <CodeBlock label="python" content={pythonSnippet} />}
          </div>
        </div>

        {/* Execute button */}
        <button
          onClick={onExecute}
          disabled={isLoading || hasValidationErrors}
          title={hasValidationErrors ? 'Fill in required parameters' : undefined}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {isLoading ? 'Running...' : 'Execute'}
          <span className="ml-auto text-white/60 text-xs">
            {isMac ? '⌘↵' : 'Ctrl+↵'}
          </span>
        </button>
      </div>
    </div>
  );
}
