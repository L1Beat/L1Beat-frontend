// Links from the chain registry and the ACPs repo come from outside this codebase.
// Only http(s) URLs are used; anything else (javascript:, data:, relative junk) is dropped.

/** The URL if it is an absolute http(s) URL, otherwise undefined. */
export function safeHref(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? trimmed : undefined;
  } catch {
    return undefined;
  }
}
