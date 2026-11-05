import { TokenLogo } from '../instrument';
import type { IcmApp, IcmToken } from '../../api';

// Tokens whose symbol is often reused by lookalikes; an ICTT app moving a token with
// one of these symbols at another address gets marked.
export const CANONICAL: Record<string, string> = {
  WAVAX: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
  USDC: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
  USDT: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7',
  'BTC.B': '0x152b9d0fdc40c096757f570a51e494bd4b943e50',
  'WETH.E': '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab',
};
export const lookalike = (t: IcmToken | null | undefined) => {
  if (!t) return false;
  const main = CANONICAL[t.symbol.toUpperCase()];
  return !!main && main !== t.address.toLowerCase();
};
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const KIND: Record<IcmApp['kind'], { chip: string; title: string } | null> = {
  'ictt-home': { chip: 'ICTT home', title: 'Token bridge (ICTT): holds the original token on the C-Chain and sends it to L1s' },
  'ictt-remote': { chip: 'ICTT remote', title: "Token bridge (ICTT): the C-Chain copy of a token whose home is on an L1" },
  other: null,
};
export const appName = (a: { name: string; label: { name: string } | null } | null, address: string, withAddress = true) =>
  a?.name || a?.label?.name || (withAddress ? `Unlabeled ${shortAddr(address)}` : 'Unlabeled contract');

export function TokenTag({ token }: { token: IcmToken }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <TokenLogo address={token.address} symbol={token.symbol} size={13} />
      <span className="num">{token.symbol}</span>
      {lookalike(token) && (
        <span className="text-[10px] text-muted-foreground/80" title={`This token calls itself ${token.symbol} but isn't the main ${token.symbol} at ${shortAddr(CANONICAL[token.symbol.toUpperCase()])}`}>
          (not the main {token.symbol})
        </span>
      )}
    </span>
  );
}

