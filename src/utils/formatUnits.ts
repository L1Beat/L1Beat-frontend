export type BaseUnitLike = string | number | bigint | null | undefined;

const POW10_CACHE = new Map<number, bigint>([
  [0, 1n],
  [1, 10n],
  [2, 100n],
  [3, 1000n],
  [6, 1_000_000n],
  [9, 1_000_000_000n],
  [18, 1_000_000_000_000_000_000n],
]);

function pow10(decimals: number): bigint {
  if (!Number.isFinite(decimals) || decimals < 0) return 1n;
  const d = Math.floor(decimals);
  const cached = POW10_CACHE.get(d);
  if (cached) return cached;
  let v = 1n;
  for (let i = 0; i < d; i++) v *= 10n;
  POW10_CACHE.set(d, v);
  return v;
}

export function parseBaseUnits(value: BaseUnitLike): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Note: numbers can be imprecise for large values; prefer string.
    return BigInt(Math.trunc(value));
  }

  const raw = String(value).trim();
  if (raw.length === 0) return null;

  if (/^-?0x[0-9a-fA-F]+$/.test(raw)) {
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  }

  if (!/^-?\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function groupThousands(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface FormatUnitsOptions {
  /** Max decimals to show (rounded half-up). Default: 2 */
  maxFractionDigits?: number;
}

/**
 * Format a base-unit integer into human units using `decimals`.
 * - BigInt-safe (no precision loss)
 * - Adds thousand separators
 * - Shows whole numbers or up to `maxFractionDigits` decimals
 */
export function formatUnits(
  baseUnits: BaseUnitLike,
  decimals: number,
  opts: FormatUnitsOptions = {}
): string {
  const v = parseBaseUnits(baseUnits);
  if (v === null) return 'N/A';

  const isNegative = v < 0n;
  const abs = isNegative ? -v : v;

  const d = Number.isFinite(decimals) ? Math.max(0, Math.floor(decimals)) : 0;
  const maxFrac = opts.maxFractionDigits ?? 2;
  const fracDigits = Math.max(0, Math.min(Math.floor(maxFrac), d));

  const scale = pow10(d);

  // Integer part
  let intPart = abs / scale;
  let remainder = abs % scale;

  if (fracDigits === 0) {
    const out = groupThousands(intPart.toString());
    return isNegative ? `-${out}` : out;
  }

  // We want to compute fractional part with rounding at `fracDigits`.
  // Compute: round(remainder / 10^(d-fracDigits)) as an integer in [0, 10^fracDigits)
  const cutScale = pow10(d - fracDigits); // base units per displayed fractional unit
  let frac = remainder / cutScale;
  const cutRemainder = remainder % cutScale;
  // Half-up rounding
  if (cutRemainder * 2n >= cutScale) {
    frac += 1n;
  }

  const fracBase = pow10(fracDigits);
  if (frac >= fracBase) {
    // carry
    intPart += 1n;
    frac = 0n;
  }

  const intStr = groupThousands(intPart.toString());

  let fracStr = frac.toString().padStart(fracDigits, '0');
  // Trim trailing zeros for readability (keep at least 0 digits -> handled above)
  while (fracStr.endsWith('0')) fracStr = fracStr.slice(0, -1);

  const out = fracStr.length ? `${intStr}.${fracStr}` : intStr;
  return isNegative ? `-${out}` : out;
}

/**
 * Best-effort conversion for computations (charts/percentages).
 * May lose precision for extremely large values.
 */
export function unitsToNumber(baseUnits: BaseUnitLike, decimals: number): number {
  const v = parseBaseUnits(baseUnits);
  if (v === null) return NaN;
  const isNegative = v < 0n;
  const abs = isNegative ? -v : v;
  const d = Number.isFinite(decimals) ? Math.max(0, Math.floor(decimals)) : 0;
  const scale = pow10(d);
  const q = abs / scale;
  const r = abs % scale;
  const n = Number(q) + Number(r) / Number(scale);
  return isNegative ? -n : n;
}


