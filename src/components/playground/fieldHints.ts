// Short, plain-language descriptions for common response fields, sourced from
// API.md. Field names are descriptive and consistent across endpoints, so a
// flat name → hint map covers most cases. Used for hover tooltips in the
// response panel; a missing key just means no tooltip.

export const FIELD_HINTS: Record<string, string> = {
  // Pagination / meta
  limit: 'Max number of results in this page',
  offset: 'Pagination offset',
  has_more: 'Whether more results exist beyond this page',
  next_cursor: 'Pass as ?cursor= to fetch the next page',
  total: 'Total matching records (only when ?count=true)',
  cursor: 'Keyset pagination cursor',

  // Blocks
  block_number: 'Block height',
  block_time: 'Block timestamp (ISO 8601, UTC)',
  block_hash: 'Block hash',
  parent_hash: 'Hash of the previous block',
  parent_id: 'Parent block ID',
  miner: 'Block producer / coinbase address',
  size: 'Block size in bytes',
  gas_limit: 'Max gas allowed in the block',
  gas_used: 'Gas actually consumed',
  base_fee_per_gas: 'EIP-1559 base fee per gas (wei)',
  tx_count: 'Number of transactions',
  proposer_node_id: 'NodeID of the block proposer',
  block_type: 'P-Chain block / tx type',

  // Transactions
  hash: 'Transaction hash',
  transaction_index: 'Position of the tx within its block',
  from: 'Sender address',
  to: 'Recipient address (null for contract creation)',
  value: 'Amount transferred (wei, string)',
  gas_price: 'Gas price paid (wei)',
  success: 'Whether the tx succeeded',
  type: 'Tx type: 0 legacy, 1 EIP-2930, 2 EIP-1559, 3 EIP-4844',
  call_type: 'Internal call type (CALL, DELEGATECALL, …)',
  trace_index: 'Path of the call in the trace tree',
  log_index: 'Index of the event log in the block',

  // Tokens / balances / stablecoins
  token: 'ERC-20 token contract address',
  symbol: 'Token symbol',
  name: 'Token name',
  decimals: 'Token decimals (scale amounts by this)',
  balance: 'Balance in the token smallest unit (string)',
  total_in: 'Total received (smallest unit)',
  total_out: 'Total sent (smallest unit)',
  total_gas: 'Total gas spent (wei)',
  peg: 'Currency the stablecoin is pegged to',
  issuer: 'Stablecoin issuer',
  bridged: 'Whether the token is bridged (vs native)',
  supply: 'Circulating supply (smallest unit, string)',
  holders: 'Number of holders',
  volume_24h: '24h transfer volume (smallest unit)',
  transfers_24h: '24h transfer count',
  amount: 'Amount in nAVAX',
  is_unlimited: 'Whether the approval is unlimited',

  // P-Chain / subnets / chains
  tx_id: 'P-Chain transaction ID (CB58)',
  tx_type: 'P-Chain transaction type (no Tx suffix)',
  subnet_id: 'Subnet ID (CB58)',
  chain_id: 'Blockchain ID (CB58)',
  evm_chain_id: 'EVM chain ID (numeric)',
  chain_name: 'Chain name',
  chain_type: 'l1 or legacy',
  vm_id: 'Virtual machine ID',
  sybil_resistance_type: 'Proof of Stake or Proof of Authority',
  network_token: 'Native/gas token info',
  network: 'mainnet or fuji',
  validator_count: 'Total validators',
  active_validators: 'Currently active validators',
  total_staked: 'Sum of validator weights (raw)',
  total_staked_tokens: 'Total staked in whole tokens (PoS only)',
  total_fees_paid: 'All-time L1 validation fees (nAVAX)',
  validator_manager_address: 'ValidatorManager contract address',

  // Validators
  node_id: 'Validator NodeID',
  validation_id: 'Validation ID (CB58)',
  weight: 'Validator weight (P-Chain uint64)',
  staked_amount: 'Stake in whole tokens (PoS only, string)',
  staked_token: 'Symbol of the staked token (PoS only)',
  uptime_percentage: 'Validator uptime (%)',
  active: 'Whether the validator is active',
  start_time: 'Validation start time',
  end_time: 'Validation end time (omitted for L1 validators)',
  initial_deposit: 'Initial balance deposit (nAVAX)',
  total_topups: 'Total balance top-ups (nAVAX)',
  remaining_balance: 'Continuous-fee balance left (nAVAX)',
  fees_paid: 'Validation fees paid so far (nAVAX)',
  days_remaining: 'Days until the balance runs out',
  network_share_percent: "Validator weight as % of the subnet total",
  bls_public_key: 'Validator BLS public key',

  // Metrics / timeseries / fee burn
  metric_name: 'Metric identifier',
  granularity: 'Time bucket: hour, day, week, or month',
  period: 'Start of the time bucket',
  unit: 'Unit of the amounts (e.g. nAVAX)',
  total_burned: 'Total fee burned in the period (nAVAX)',
  base_fee_burned: 'Base-fee portion burned (nAVAX)',
  priority_fee_burned: 'Priority-tip portion burned (nAVAX)',
  cumulative: 'All-time cumulative totals',
  nakamoto_33: 'Min validators controlling >33% of weight',
  nakamoto_50: 'Min validators controlling >50% of weight',
  total_weight: 'Total active validator weight',
};

export function fieldHint(key: string): string | undefined {
  return FIELD_HINTS[key];
}
