import { useState } from 'react';

// Logos come from DefiLlama's icon CDN; when one fails, a lettered disc takes its place.

// DefiLlama protocol slugs, keyed by our protocol ids where they differ.
const PROTOCOL_SLUG: Record<string, string> = {
  pharaoh: 'pharaoh-exchange',
  sushiswap: 'sushi',
  aave: 'aave-v3',
};

function Fallback({ label, size, square }: { label: string; size: number; square?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 bg-accent text-foreground font-semibold ${square ? 'rounded-[4px]' : 'rounded-full'}`}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.45)) }}
      aria-hidden
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}

function Img({ sources, label, size, square }: { sources: string[]; label: string; size: number; square?: boolean }) {
  const [idx, setIdx] = useState(0);
  if (idx >= sources.length) return <Fallback label={label} size={size} square={square} />;
  return (
    <img
      key={sources[idx]}
      src={sources[idx]}
      alt=""
      title={label}
      loading="lazy"
      width={size}
      height={size}
      onError={() => setIdx((i) => i + 1)}
      className={`shrink-0 bg-muted object-cover ${square ? 'rounded-[4px]' : 'rounded-full'}`}
      style={{ width: size, height: size }}
    />
  );
}

/** A protocol's logo, e.g. Pharaoh or GMX, by our protocol id. */
export function ProtocolLogo({ protocol, name, size = 20 }: { protocol: string; name: string; size?: number }) {
  const slug = PROTOCOL_SLUG[protocol] ?? protocol;
  return <Img sources={[`https://icons.llamao.fi/icons/protocols/${slug}?w=48&h=48`]} label={name} size={size} square />;
}

/** A C-Chain token's logo by contract address. */
export function TokenLogo({ address, symbol, size = 20 }: { address: string; symbol: string; size?: number }) {
  const a = address.toLowerCase();
  return (
    <Img
      sources={[`https://token-icons.llamao.fi/icons/tokens/43114/${a}?h=48&w=48`, `https://dd.dexscreener.com/ds-data/tokens/avalanche/${a}.png`]}
      label={symbol || '?'}
      size={size}
    />
  );
}

/** Two token logos overlapped, for a trading pair. */
export function PairLogos({ a, b, size = 20 }: { a: { address: string; symbol: string }; b: { address: string; symbol: string }; size?: number }) {
  return (
    <span className="inline-flex items-center shrink-0" aria-hidden>
      <TokenLogo address={a.address} symbol={a.symbol} size={size} />
      <span className="-ml-1.5 rounded-full ring-2 ring-card inline-flex">
        <TokenLogo address={b.address} symbol={b.symbol} size={size} />
      </span>
    </span>
  );
}
