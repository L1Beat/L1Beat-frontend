/** `NodeID-4pmpS7…z2Kv`: the prefix says what it is, 6 + 4 characters tell nodes apart. */
export function shortNodeId(id: string): string {
  const bare = id.replace(/^NodeID-/, '');
  return `NodeID-${bare.length > 11 ? `${bare.slice(0, 6)}…${bare.slice(-4)}` : bare}`;
}
