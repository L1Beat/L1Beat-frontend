export type NavaxLike = string | number | bigint | null | undefined;

const NAVAX_PER_AVAX = 1_000_000_000n;
const NAVAX_PER_CENTI_AVAX = 10_000_000n; // 0.01 AVAX
const ROUNDING_HALF_UP = 5_000_000n; // half of 1e7

export function parseNavax(value: NavaxLike): bigint | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Note: numbers may be imprecise for large nAVAX; prefer string inputs.
    return BigInt(Math.trunc(value));
  }

  const raw = String(value).trim();
  if (raw.length === 0) return null;

  // Accept hex BigInt strings too.
  if (/^-?0x[0-9a-fA-F]+$/.test(raw)) {
    try {
      return BigInt(raw);
    } catch {
      return null;
    }
  }

  // We expect integer nAVAX strings; reject decimals/scientific to avoid silent corruption.
  if (!/^-?\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function groupThousands(intStr: string): string {
  // intStr should be digits only (no sign)
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Convert nAVAX -> AVAX (divide by 1e9) and format with thousand separators.
 * - Returns whole numbers or up to 2 decimals (rounded half-up)
 * - Accepts string/BigInt to preserve precision for large values
 */
export function formatNavaxToAvax(value: NavaxLike): string {
  const navax = parseNavax(value);
  if (navax === null) return 'N/A';

  const isNegative = navax < 0n;
  const abs = isNegative ? -navax : navax;

  // Round to 2 decimal places (centi-AVAX) using integer math.
  const roundedCenti = (abs + ROUNDING_HALF_UP) / NAVAX_PER_CENTI_AVAX; // in 0.01 AVAX units
  const intPart = roundedCenti / 100n;
  const decPart = roundedCenti % 100n;

  const intStr = groupThousands(intPart.toString());

  if (decPart === 0n) {
    return isNegative ? `-${intStr}` : intStr;
  }

  // Trim trailing zeros (max 2 decimals)
  let decStr = decPart.toString().padStart(2, '0');
  if (decStr.endsWith('0')) decStr = decStr.slice(0, 1);

  return isNegative ? `-${intStr}.${decStr}` : `${intStr}.${decStr}`;
}

/**
 * Best-effort conversion for computations (charts/percentages).
 * Returns a JS number in AVAX, potentially losing precision for extremely large values.
 */
export function navaxToAvaxNumber(value: NavaxLike): number {
  const navax = parseNavax(value);
  if (navax === null) return NaN;
  // Use quotient + remainder to keep some fractional precision.
  const isNegative = navax < 0n;
  const abs = isNegative ? -navax : navax;
  const q = abs / NAVAX_PER_AVAX;
  const r = abs % NAVAX_PER_AVAX;
  const n = Number(q) + Number(r) / 1e9;
  return isNegative ? -n : n;
}


