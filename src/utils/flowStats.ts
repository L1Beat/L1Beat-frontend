import type { TeleporterMessageData } from '../types';

export interface FlowStats {
  /** Messages in the window. */
  total: number;
  /** Distinct source → target pairs. */
  corridors: number;
  /** Distinct chains that sent at least one message. */
  sources: number;
  /** Distinct chains that received at least one message. */
  targets: number;
  /** Distinct chains on either end. */
  chains: number;
  /** Busiest corridor and its share of all messages, if any. */
  top: { source: string; target: string; count: number; share: number } | null;
}

const EMPTY: FlowStats = { total: 0, corridors: 0, sources: 0, targets: 0, chains: 0, top: null };

/** Headline numbers for a window of interchain messages. Shared by the Flows page and the Overview hero. */
export function summarizeFlows(data: TeleporterMessageData | null | undefined): FlowStats {
  if (!data?.messages?.length) return EMPTY;
  const corridors = new Map<string, { source: string; target: string; count: number }>();
  const sources = new Set<string>();
  const targets = new Set<string>();
  let total = 0;
  for (const m of data.messages) {
    const key = `${m.source}->${m.target}`;
    const c = corridors.get(key);
    if (c) c.count += m.value;
    else corridors.set(key, { source: m.source, target: m.target, count: m.value });
    sources.add(m.source);
    targets.add(m.target);
    total += m.value;
  }
  let top: FlowStats['top'] = null;
  for (const c of corridors.values()) {
    if (!top || c.count > top.count) top = { ...c, share: total > 0 ? (c.count / total) * 100 : 0 };
  }
  return {
    total,
    corridors: corridors.size,
    sources: sources.size,
    targets: targets.size,
    chains: new Set([...sources, ...targets]).size,
    top,
  };
}

/** "Avalanche C-Chain" for the hub, Title Case for the rest. */
export function flowChainLabel(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('c-chain') || lower.includes('cchain')) return 'C-Chain';
  return name.charAt(0).toUpperCase() + name.slice(1);
}
