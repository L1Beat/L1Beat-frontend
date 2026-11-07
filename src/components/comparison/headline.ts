import { format } from 'date-fns';
import type { ComparisonMetricType } from './ComparisonChart';
import type { CompareSummary } from './ComparisonView';

export function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n >= 10 || Number.isInteger(n) ? Math.round(n).toLocaleString() : n.toFixed(1);
}

function ratio(r: number): string {
  return r >= 10 ? Math.round(r).toLocaleString() : r.toFixed(1);
}

function listNames(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const NOUN: Record<ComparisonMetricType, string> = {
  dailyTxCount: 'transaction',
  dailyActiveAddresses: 'active address',
  maxTPS: 'TPS',
  gasUsed: 'gas',
  feesPaid: 'fee',
  avgGasPrice: 'gas price',
  icmMessages: 'ICM message',
};

// How each metric reads in a sentence: the comparison, a lone chain, and the unit.
const PHRASE: Record<ComparisonMetricType, {
  more: (a: string, r: string, b: string) => string;
  /** Under 2x a percentage reads truer than "1.1x as many". */
  pct: (a: string, p: number, b: string) => string;
  same: (a: string, b: string) => string;
  one: (a: string, v: string) => string;
  unit: string;
}> = {
  dailyTxCount: {
    more: (a, r, b) => `${a} processed ${r}x as many transactions as ${b}`,
    pct: (a, p, b) => `${a} processed ${p}% more transactions than ${b}`,
    same: (a, b) => `${a} and ${b} processed about the same number of transactions`,
    one: (a, v) => `${a} processed ${v} transactions`,
    unit: 'transactions',
  },
  dailyActiveAddresses: {
    more: (a, r, b) => `${a} averaged ${r}x as many daily active addresses as ${b}`,
    pct: (a, p, b) => `${a} averaged ${p}% more daily active addresses than ${b}`,
    same: (a, b) => `${a} and ${b} averaged about the same number of daily active addresses`,
    one: (a, v) => `${a} averaged ${v} daily active addresses`,
    unit: 'a day on average',
  },
  maxTPS: {
    more: (a, r, b) => `${a} peaked at ${r}x the TPS of ${b}`,
    pct: (a, p, b) => `${a} peaked at ${p}% higher TPS than ${b}`,
    same: (a, b) => `${a} and ${b} peaked at about the same TPS`,
    one: (a, v) => `${a} peaked at ${v} TPS`,
    unit: 'TPS at peak',
  },
  gasUsed: {
    more: (a, r, b) => `${a} used ${r}x as much gas as ${b}`,
    pct: (a, p, b) => `${a} used ${p}% more gas than ${b}`,
    same: (a, b) => `${a} and ${b} used about the same amount of gas`,
    one: (a, v) => `${a} used ${v} gas`,
    unit: 'gas',
  },
  // The hero never speaks to fees (each chain pays them in its own token); kept so the map is complete.
  feesPaid: {
    more: (a, r, b) => `${a} collected ${r}x the fees of ${b}`,
    pct: (a, p, b) => `${a} collected ${p}% more in fees than ${b}`,
    same: (a, b) => `${a} and ${b} collected about the same fees`,
    one: (a, v) => `${a} collected ${v} in fees`,
    unit: 'in fees',
  },
  avgGasPrice: {
    more: (a, r, b) => `${a} had ${r}x the gas price of ${b}`,
    pct: (a, p, b) => `${a} had a ${p}% higher gas price than ${b}`,
    same: (a, b) => `${a} and ${b} had about the same gas price`,
    one: (a, v) => `${a} averaged a ${v} gas price`,
    unit: 'gas price',
  },
  icmMessages: {
    more: (a, r, b) => `${a} handled ${r}x as many ICM messages as ${b}`,
    pct: (a, p, b) => `${a} handled ${p}% more ICM messages than ${b}`,
    same: (a, b) => `${a} and ${b} handled about the same number of ICM messages`,
    one: (a, v) => `${a} handled ${v} ICM messages`,
    unit: 'messages',
  },
};

export function windowText(s: Pick<CompareSummary, 'since' | 'days'>): string {
  if (s.since != null) return `since ${format(new Date(s.since * 1000), 'MMM d')}`;
  return s.days === 365 ? 'in the last year' : `in the last ${s.days} days`;
}

/** The hero's sentence and the line under it. Null when no chain has a figure. */
export function headline(s: CompareSummary): { lead: string; detail: string | null } | null {
  const rows = s.rows
    .filter((r): r is CompareSummary['rows'][number] & { value: number } => r.value != null && r.value > 0)
    .sort((a, b) => b.value - a.value);
  const window = windowText(s);
  // ICM is counted from an index of every message, so zero means no traffic, not no data.
  const icm = s.metric === 'icmMessages';
  const quiet = icm ? s.rows.filter((r) => r.value === 0).map((r) => r.name) : [];
  if (rows.length === 0) {
    return quiet.length > 0 ? { lead: `None of these chains sent or received an ICM message ${window}.`, detail: null } : null;
  }
  const p = PHRASE[s.metric];
  // Say which chains have no data, so a lone figure isn't read as a win.
  const missing = s.rows.filter((r) => r.value == null || (!icm && r.value <= 0)).map((r) => r.name);
  let missingNote = missing.length > 0
    ? ` ${listNames(missing)} ${missing.length === 1 ? 'has' : 'have'} no ${NOUN[s.metric]} data yet.`
    : '';
  if (quiet.length > 0) missingNote += ` ${listNames(quiet)} sent and received none.`;
  if (rows.length === 1) {
    const only = rows[0];
    return { lead: `${p.one(only.name, `${only.lowerBound ? 'at least ' : ''}${compact(only.value)}`)} ${window}.`, detail: missingNote.trim() || null };
  }
  const [a, b] = rows;
  // An undercount can't carry a ratio: say the top figure, and which ones read low.
  const low = rows.filter((row) => row.lowerBound).map((row) => row.name);
  if (low.length > 0) {
    const fig = (row: typeof a) => `${row.lowerBound ? 'at least ' : ''}${compact(row.value)}`;
    let detail = `${listNames(low)} ${low.length === 1 ? 'is' : 'are'} counted by L1Beat from ${low.length === 1 ? 'its' : 'their'} blocks, which misses some addresses, so ${low.length === 1 ? 'its figure is a lower bound' : 'their figures are lower bounds'}.`;
    if (s.since != null) detail += ' Counted from the first day all of them have data.';
    return { lead: `${p.one(a.name, fig(a))} ${window}, the most of the ${rows.length === 2 ? 'two' : rows.length}.`, detail: detail + missingNote };
  }
  const r = a.value / b.value;
  const lead = r < 1.05
    ? `${p.same(a.name, b.name)} ${window}.`
    : r < 2
      ? `${p.pct(a.name, Math.round((r - 1) * 100), b.name)} ${window}.`
      : `${p.more(a.name, ratio(r), b.name)} ${window}.`;
  // The strip at the foot of the hero gives each chain's figure; say what it can't.
  const n = rows.length;
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  let detail = icm
    // Summing would count a message twice when the C-Chain and the L1 on its other end are both picked.
    ? `The ${n === 2 ? 'two' : n} chains range from ${compact(rows[n - 1].value)} to ${compact(a.value)} messages. An L1's count is its traffic with the C-Chain, where nearly all ICM runs.`
    : s.metric === 'dailyTxCount' || s.metric === 'gasUsed'
      ? `Together the ${n} chains ${s.metric === 'gasUsed' ? 'used' : 'processed'} ${compact(total)} ${s.metric === 'gasUsed' ? 'gas' : 'transactions'}, ${Math.round((a.value / total) * 100)}% of it on ${a.name}.`
      : `${n === 2 ? 'The two chains' : `The ${n} chains`} range from ${compact(rows[n - 1].value)} to ${compact(a.value)} ${p.unit}.`;
  if (s.since != null) detail += ' Counted from the first day all of them have data.';
  detail += missingNote;
  return { lead, detail };
}
