export type ParamKind = 'path' | 'query';
export type ParamType = 'string' | 'int' | 'boolean' | 'enum' | 'date' | 'chainId' | 'subnetId';

export interface ParamDef {
  name: string;
  kind: ParamKind;
  type: ParamType;
  required: boolean;
  default?: string;
  description: string;
  options?: string[];
  placeholder?: string;
  min?: number;
  max?: number;
}

export interface EndpointDef {
  id: string;
  method: 'GET';
  path: string;
  title: string;
  description: string;
  category: string;
  params: ParamDef[];
  notes?: string[];
  suggestedNext?: string[];
}

export interface WsEndpointDef {
  id: string;
  path: string;
  title: string;
  description: string;
  category: string;
  params: ParamDef[];
}

export interface FeaturedQuery {
  title: string;
  description: string;
  endpointId: string;
  params: Record<string, string>;
  icon: string;
}

const limitParam = (max = 100): ParamDef => ({
  name: 'limit',
  kind: 'query',
  type: 'int',
  required: false,
  default: '5',
  min: 1,
  max,
  description: 'Number of results to return',
});

const offsetParam: ParamDef = {
  name: 'offset',
  kind: 'query',
  type: 'int',
  required: false,
  default: '0',
  min: 0,
  description: 'Pagination offset',
};

const cursorParam: ParamDef = {
  name: 'cursor',
  kind: 'query',
  type: 'string',
  required: false,
  default: '',
  description: 'Cursor for keyset pagination; use next_cursor from previous response',
  placeholder: '',
};

const countParam: ParamDef = {
  name: 'count',
  kind: 'query',
  type: 'boolean',
  required: false,
  default: '',
  description: 'Include total count in response (adds ~50ms)',
};

const chainIdPathParam: ParamDef = {
  name: 'chainId',
  kind: 'path',
  type: 'chainId',
  required: true,
  default: '43114',
  description: 'The EVM chain ID',
};

const daysParam = (def: string, max = 3650): ParamDef => ({
  name: 'days',
  kind: 'query',
  type: 'int',
  required: false,
  default: def,
  min: 1,
  max,
  description: 'Number of complete UTC days, ending yesterday',
});

const sizedLimitParam = (def: string, max: number): ParamDef => ({
  name: 'limit',
  kind: 'query',
  type: 'int',
  required: false,
  default: def,
  min: 1,
  max,
  description: 'Number of results to return',
});

const WINDOW_NOTE =
  'A window is N complete UTC days ending at as_of (normally yesterday), not a rolling 24 hours. If it reaches back before the start of history it is shortened, and the returned days and from show the actual window.';

export const REST_ENDPOINTS: EndpointDef[] = [
  // Health & System
  {
    id: 'health',
    method: 'GET',
    path: '/health',
    title: 'Health Check',
    description: 'Check API and database connectivity',
    category: 'Health & System',
    params: [],
  },
  {
    id: 'indexer-status',
    method: 'GET',
    path: '/api/v1/metrics/indexer/status',
    title: 'Indexer Status',
    description: 'Get sync status for all indexed chains',
    category: 'Health & System',
    params: [],
    suggestedNext: ['evm-blocks', 'metrics-chain-stats'],
  },
  // EVM Data
  {
    id: 'evm-blocks',
    method: 'GET',
    path: '/api/v1/data/evm/{chainId}/blocks',
    title: 'EVM Blocks',
    description: 'Get recent blocks for an EVM chain',
    category: 'EVM Data',
    params: [
      chainIdPathParam,
      limitParam(100),
      offsetParam,
      cursorParam,
      countParam,
    ],
    suggestedNext: ['evm-txs', 'ws-blocks', 'metrics-chain-stats'],
  },
  {
    id: 'evm-block-by-number',
    method: 'GET',
    path: '/api/v1/data/evm/{chainId}/blocks/{number}',
    title: 'Block by Number',
    description: 'Get a single block by block number',
    category: 'EVM Data',
    params: [
      chainIdPathParam,
      {
        name: 'number',
        kind: 'path',
        type: 'int',
        required: true,
        default: '',
        placeholder: '54000000',
        description: 'Block number to look up',
      },
    ],
    suggestedNext: ['evm-txs', 'evm-blocks'],
  },
  {
    id: 'evm-txs',
    method: 'GET',
    path: '/api/v1/data/evm/{chainId}/txs',
    title: 'EVM Transactions',
    description: 'Get recent transactions for an EVM chain',
    category: 'EVM Data',
    params: [
      chainIdPathParam,
      limitParam(100),
      offsetParam,
      cursorParam,
      countParam,
    ],
    suggestedNext: ['evm-tx-by-hash', 'evm-address-txs'],
  },
  {
    id: 'evm-tx-by-hash',
    method: 'GET',
    path: '/api/v1/data/evm/{chainId}/txs/{hash}',
    title: 'Transaction by Hash',
    description: 'Get a single transaction by hash',
    category: 'EVM Data',
    params: [
      chainIdPathParam,
      {
        name: 'hash',
        kind: 'path',
        type: 'string',
        required: true,
        default: '',
        placeholder: '0x1234...abcd',
        description: 'Transaction hash (with or without 0x prefix)',
      },
    ],
    notes: ['Includes internal transactions, token transfers, and ERC-20 approvals'],
    suggestedNext: ['evm-address-txs', 'evm-address-native'],
  },
  {
    id: 'evm-address-txs',
    method: 'GET',
    path: '/api/v1/data/evm/{chainId}/address/{address}/txs',
    title: 'Address Transactions',
    description: 'Get transactions for a specific address',
    category: 'EVM Data',
    params: [
      chainIdPathParam,
      {
        name: 'address',
        kind: 'path',
        type: 'string',
        required: true,
        default: '',
        placeholder: '0xabcd...1234',
        description: 'Ethereum address (with or without 0x prefix)',
      },
      limitParam(100),
      offsetParam,
      cursorParam,
      countParam,
    ],
    suggestedNext: ['evm-address-native', 'evm-address-balances', 'evm-address-internal-txs'],
  },
  {
    id: 'evm-address-internal-txs',
    method: 'GET',
    path: '/api/v1/data/evm/{chainId}/address/{address}/internal-txs',
    title: 'Address Internal Transactions',
    description: 'Get internal transactions (traces) for an address',
    category: 'EVM Data',
    params: [
      chainIdPathParam,
      {
        name: 'address',
        kind: 'path',
        type: 'string',
        required: true,
        default: '',
        placeholder: '0xabcd...1234',
        description: 'Ethereum address (with or without 0x prefix)',
      },
      limitParam(100),
      offsetParam,
      cursorParam,
      countParam,
    ],
    notes: ['Only includes traces with value > 0 or CREATE/CREATE2 types'],
  },
  {
    id: 'evm-address-balances',
    method: 'GET',
    path: '/api/v1/data/evm/{chainId}/address/{address}/balances',
    title: 'Address Token Balances',
    description: 'Get ERC-20 token balances for an address',
    category: 'EVM Data',
    params: [
      chainIdPathParam,
      {
        name: 'address',
        kind: 'path',
        type: 'string',
        required: true,
        default: '',
        placeholder: '0xabcd...1234',
        description: 'Ethereum address (with or without 0x prefix)',
      },
      limitParam(100),
      offsetParam,
      countParam,
    ],
    notes: ['Only returns tokens with balance > 0. Offset-only pagination.'],
  },
  {
    id: 'evm-address-native',
    method: 'GET',
    path: '/api/v1/data/evm/{chainId}/address/{address}/native',
    title: 'Address Native Balance',
    description: 'Get native token balance and transaction summary for an address',
    category: 'EVM Data',
    params: [
      chainIdPathParam,
      {
        name: 'address',
        kind: 'path',
        type: 'string',
        required: true,
        default: '',
        placeholder: '0xabcd...1234',
        description: 'Ethereum address (with or without 0x prefix)',
      },
    ],
    notes: ['All values in wei (string). Returns zeros if address has no history.'],
    suggestedNext: ['evm-address-txs', 'evm-address-balances'],
  },

  {
    id: 'evm-stablecoins',
    method: 'GET',
    path: '/api/v1/data/evm/{chainId}/stablecoins',
    title: 'Stablecoins',
    description: 'Curated stablecoins with circulating supply, holder count, and 24h transfer stats',
    category: 'EVM Data',
    params: [chainIdPathParam],
    notes: ['Amount fields (supply, volume_24h) are strings in the token smallest unit; scale by decimals.'],
    suggestedNext: ['evm-stablecoins-timeseries'],
  },
  {
    id: 'evm-stablecoins-timeseries',
    method: 'GET',
    path: '/api/v1/data/evm/{chainId}/stablecoins/timeseries',
    title: 'Stablecoin Timeseries',
    description: 'Time series for a stablecoin metric, per token or aggregated',
    category: 'EVM Data',
    params: [
      chainIdPathParam,
      {
        name: 'metric',
        kind: 'query',
        type: 'enum',
        required: true,
        default: 'supply',
        options: ['supply', 'volume', 'transfers', 'holders'],
        description: 'Metric to retrieve',
      },
      {
        name: 'granularity',
        kind: 'query',
        type: 'enum',
        required: false,
        default: 'day',
        options: ['hour', 'day', 'week', 'month'],
        description: 'Time granularity',
      },
      {
        name: 'token',
        kind: 'query',
        type: 'string',
        required: false,
        default: '',
        placeholder: '0xb97ef9ef...',
        description: 'Token address (0x-hex). Omit for all stablecoins on the chain',
      },
      {
        name: 'from',
        kind: 'query',
        type: 'date',
        required: false,
        default: '',
        description: 'Start time (date, RFC3339, or unix)',
      },
      {
        name: 'to',
        kind: 'query',
        type: 'date',
        required: false,
        default: '',
        description: 'End time',
      },
      {
        name: 'limit',
        kind: 'query',
        type: 'int',
        required: false,
        default: '365',
        min: 1,
        max: 5000,
        description: 'Data points per token (max 5000)',
      },
    ],
  },

  // P-Chain Data
  {
    id: 'pchain-txs',
    method: 'GET',
    path: '/api/v1/data/pchain/txs',
    title: 'P-Chain Transactions',
    description: 'Get P-Chain transactions with optional type and subnet filtering',
    category: 'P-Chain Data',
    params: [
      {
        name: 'tx_type',
        kind: 'query',
        type: 'enum',
        required: false,
        default: '',
        options: [
          'RegisterL1Validator',
          'IncreaseL1ValidatorBalance',
          'SetL1ValidatorWeight',
          'DisableL1Validator',
          'ConvertSubnetToL1',
          'CreateSubnet',
          'CreateChain',
          'AddValidator',
          'AddDelegator',
          'AddSubnetValidator',
          'RemoveSubnetValidator',
          'AddPermissionlessValidator',
          'AddPermissionlessDelegator',
        ],
        description: 'Filter by transaction type (P-Chain type name, no Tx suffix)',
      },
      {
        name: 'subnet_id',
        kind: 'query',
        type: 'subnetId',
        required: false,
        default: '',
        description: 'Filter by subnet ID (CB58 format)',
      },
      limitParam(100),
      offsetParam,
      cursorParam,
      countParam,
    ],
    suggestedNext: ['pchain-tx-by-id', 'pchain-tx-types', 'validators'],
  },
  {
    id: 'pchain-tx-by-id',
    method: 'GET',
    path: '/api/v1/data/pchain/txs/{txId}',
    title: 'P-Chain Transaction by ID',
    description: 'Get a single P-Chain transaction by transaction ID',
    category: 'P-Chain Data',
    params: [
      {
        name: 'txId',
        kind: 'path',
        type: 'string',
        required: true,
        default: '',
        placeholder: '22FdhKfCTTW...xxNeV',
        description: 'Transaction ID in CB58 format',
      },
    ],
  },
  {
    id: 'pchain-tx-types',
    method: 'GET',
    path: '/api/v1/data/pchain/tx-types',
    title: 'P-Chain Transaction Types',
    description: 'Get all P-Chain transaction types with counts',
    category: 'P-Chain Data',
    params: [
      {
        name: 'days',
        kind: 'query',
        type: 'int',
        required: false,
        default: '',
        description: 'Restrict counts to the last N days (omit for all-time)',
      },
    ],
    suggestedNext: ['pchain-txs'],
  },
  {
    id: 'pchain-stats',
    method: 'GET',
    path: '/api/v1/data/pchain/stats',
    title: 'P-Chain Stats',
    description: 'Headline P-Chain counters (active subnets, chains, validators, recent txs, fees)',
    category: 'P-Chain Data',
    params: [],
    suggestedNext: ['pchain-subnet-timeline', 'pchain-blocks'],
  },
  {
    id: 'pchain-subnet-timeline',
    method: 'GET',
    path: '/api/v1/data/pchain/subnet-timeline',
    title: 'Subnet Conversion Timeline',
    description: 'Monthly count of subnets converted to L1, oldest first',
    category: 'P-Chain Data',
    params: [],
  },
  {
    id: 'pchain-blocks',
    method: 'GET',
    path: '/api/v1/data/pchain/blocks',
    title: 'P-Chain Blocks',
    description: 'Recent P-Chain blocks (summarized from transactions), newest first',
    category: 'P-Chain Data',
    params: [
      {
        name: 'days',
        kind: 'query',
        type: 'int',
        required: false,
        default: '7',
        description: 'Look-back window in days',
      },
      limitParam(100),
      offsetParam,
    ],
    suggestedNext: ['pchain-block-by-number'],
  },
  {
    id: 'pchain-block-by-number',
    method: 'GET',
    path: '/api/v1/data/pchain/blocks/{number}',
    title: 'P-Chain Block by Number',
    description: 'A single P-Chain block by number, with proposer and parent metadata',
    category: 'P-Chain Data',
    params: [
      {
        name: 'number',
        kind: 'path',
        type: 'int',
        required: true,
        default: '',
        placeholder: '24160141',
        description: 'Block number to look up',
      },
    ],
  },

  // Subnets & Chains
  {
    id: 'subnet-detail',
    method: 'GET',
    path: '/api/v1/data/subnets/{subnetId}',
    title: 'Subnet Detail',
    description: 'Get detailed information about a specific subnet',
    category: 'Subnets & Chains',
    params: [
      {
        name: 'subnetId',
        kind: 'path',
        type: 'subnetId',
        required: true,
        default: '11111111111111111111111111111111LpoYY',
        description: 'Subnet ID in CB58 format',
      },
    ],
    suggestedNext: ['validators', 'chains'],
  },
  {
    id: 'chains',
    method: 'GET',
    path: '/api/v1/data/chains',
    title: 'Chains',
    description: 'Get a paginated list of all indexed chains',
    category: 'Subnets & Chains',
    params: [
      {
        name: 'chain_type',
        kind: 'query',
        type: 'enum',
        required: false,
        default: '',
        options: ['l1', 'legacy'],
        description: 'Filter by chain type',
      },
      {
        name: 'active',
        kind: 'query',
        type: 'boolean',
        required: false,
        default: '',
        description: 'Only show chains with active validators',
      },
      {
        name: 'category',
        kind: 'query',
        type: 'string',
        required: false,
        default: '',
        placeholder: 'DeFi',
        description: 'Filter by category (e.g. DeFi, Gaming), case-insensitive',
      },
      limitParam(100),
      offsetParam,
      cursorParam,
      countParam,
    ],
    notes: ['PoS chains include total_staked_tokens (whole tokens); pair with network_token.symbol.'],
    suggestedNext: ['chain-risk', 'validators', 'metrics-fees', 'metrics-chain-stats'],
  },
  {
    id: 'chain-risk',
    method: 'GET',
    path: '/api/v1/data/chains/{chainId}/risk',
    title: 'Chain Risk & Decentralization',
    description: 'ValidatorManager risk profile and decentralization (Nakamoto) for a chain',
    category: 'Subnets & Chains',
    params: [
      {
        name: 'chainId',
        kind: 'path',
        type: 'string',
        required: true,
        default: '',
        placeholder: '2q9e4r6Mu...',
        description: 'Blockchain ID (CB58) — the same chain_id returned by /chains, not the EVM chain id',
      },
    ],
    notes: ['decentralization is present only when the chain has active L1 validators.'],
  },

  // Validators
  {
    id: 'validators',
    method: 'GET',
    path: '/api/v1/data/validators',
    title: 'Validators',
    description: 'Get a list of validators with optional subnet filtering',
    category: 'Validators',
    params: [
      {
        name: 'subnet_id',
        kind: 'query',
        type: 'subnetId',
        required: false,
        default: '',
        description: 'Filter by subnet ID (CB58)',
      },
      {
        name: 'active',
        kind: 'query',
        type: 'boolean',
        required: false,
        default: '',
        description: 'Only show active validators',
      },
      limitParam(100),
      offsetParam,
      countParam,
    ],
    notes: [
      'Offset-only pagination (no cursor support)',
      'staked_amount / staked_token (whole tokens) present for PoS chains; PoA chains show abstract weight only.',
    ],
    suggestedNext: ['validator-detail', 'metrics-fees'],
  },
  {
    id: 'validator-detail',
    method: 'GET',
    path: '/api/v1/data/validators/{id}',
    title: 'Validator Detail',
    description: 'Get detailed information about a specific validator',
    category: 'Validators',
    params: [
      {
        name: 'id',
        kind: 'path',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'NodeID-ABC123...',
        description: 'Validation ID or Node ID (e.g. NodeID-ABC123...)',
      },
      {
        name: 'subnet_id',
        kind: 'query',
        type: 'subnetId',
        required: false,
        default: '',
        description: 'Required when a node validates multiple subnets',
      },
    ],
    suggestedNext: ['validator-deposits', 'metrics-fees-daily'],
  },
  {
    id: 'validator-deposits',
    method: 'GET',
    path: '/api/v1/data/validators/{id}/deposits',
    title: 'Validator Deposits',
    description: 'Get deposit history for a validator',
    category: 'Validators',
    params: [
      {
        name: 'id',
        kind: 'path',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'NodeID-ABC123...',
        description: 'Validation ID or Node ID',
      },
      limitParam(100),
      offsetParam,
      cursorParam,
      countParam,
    ],
  },

  // Metrics - Fees
  {
    id: 'metrics-fees',
    method: 'GET',
    path: '/api/v1/metrics/fees',
    title: 'L1 Fees Overview',
    description: 'Get aggregated validation fee data across all L1 subnets',
    category: 'Metrics - Fees',
    params: [
      {
        name: 'subnet_id',
        kind: 'query',
        type: 'subnetId',
        required: false,
        default: '',
        description: 'Filter by subnet ID',
      },
      limitParam(100),
      offsetParam,
      countParam,
    ],
    notes: ['summary field always present; aggregated totals across ALL L1 subnets'],
    suggestedNext: ['metrics-fees-daily', 'validators'],
  },
  {
    id: 'metrics-fees-daily',
    method: 'GET',
    path: '/api/v1/metrics/fees/daily',
    title: 'Daily Fee Breakdown',
    description: 'Get per-day validation fee data for a subnet',
    category: 'Metrics - Fees',
    params: [
      {
        name: 'subnet_id',
        kind: 'query',
        type: 'subnetId',
        required: true,
        default: '11111111111111111111111111111111LpoYY',
        description: 'Subnet ID (required)',
      },
      {
        name: 'days',
        kind: 'query',
        type: 'int',
        required: false,
        default: '',
        description: 'Number of days (default: all days since first validator)',
      },
      {
        name: 'validators',
        kind: 'query',
        type: 'boolean',
        required: false,
        default: '',
        description: 'Include per-validator breakdown',
      },
    ],
    notes: ['Fee burn = active_seconds × 512 nAVAX. Full day = 44,236,800 nAVAX per validator.'],
  },
  {
    id: 'metrics-evm-fees-burned',
    method: 'GET',
    path: '/api/v1/metrics/evm/{chainId}/fees/burned',
    title: 'EVM Fee Burn',
    description: 'Transaction-fee burn split into total / base-fee / priority-tip, per period plus cumulative',
    category: 'Metrics - Fees',
    params: [
      chainIdPathParam,
      {
        name: 'granularity',
        kind: 'query',
        type: 'enum',
        required: false,
        default: 'day',
        options: ['hour', 'day', 'week', 'month'],
        description: 'Time granularity',
      },
      {
        name: 'from',
        kind: 'query',
        type: 'date',
        required: false,
        default: '',
        description: 'Start time (date, RFC3339, or unix)',
      },
      {
        name: 'to',
        kind: 'query',
        type: 'date',
        required: false,
        default: '',
        description: 'End time',
      },
      {
        name: 'limit',
        kind: 'query',
        type: 'int',
        required: false,
        default: '100',
        min: 1,
        max: 1000,
        description: 'Number of periods (max 1000)',
      },
    ],
    notes: ['Amounts are nAVAX strings; series is chronological (oldest first).'],
  },
  {
    id: 'metrics-burned-total',
    method: 'GET',
    path: '/api/v1/metrics/burned/total',
    title: 'Network AVAX Burned',
    description: 'Network-wide all-time AVAX burned, split by chain (P / X / C)',
    category: 'Metrics - Fees',
    params: [],
  },

  // Metrics - Chain Stats
  {
    id: 'metrics-chain-stats',
    method: 'GET',
    path: '/api/v1/metrics/evm/{chainId}/stats',
    title: 'Chain Stats',
    description: 'Get aggregate statistics for an EVM chain',
    category: 'Metrics - Chain Stats',
    params: [chainIdPathParam],
    suggestedNext: ['metrics-timeseries-data', 'evm-blocks'],
  },
  {
    id: 'metrics-timeseries-list',
    method: 'GET',
    path: '/api/v1/metrics/evm/{chainId}/timeseries',
    title: 'Available Timeseries',
    description: 'List all available timeseries metrics for a chain',
    category: 'Metrics - Chain Stats',
    params: [chainIdPathParam],
    suggestedNext: ['metrics-timeseries-data'],
  },
  {
    id: 'metrics-timeseries-data',
    method: 'GET',
    path: '/api/v1/metrics/evm/{chainId}/timeseries/{metric}',
    title: 'Timeseries Data',
    description: 'Get time-series metric data for an EVM chain',
    category: 'Metrics - Chain Stats',
    params: [
      chainIdPathParam,
      {
        name: 'metric',
        kind: 'path',
        type: 'enum',
        required: true,
        default: 'tx_count',
        options: [
          'tx_count',
          'active_addresses',
          'active_senders',
          'fees_paid',
          'gas_used',
          'contracts',
          'deployers',
          'avg_tps',
          'max_tps',
          'avg_gps',
          'max_gps',
          'avg_gas_price',
          'max_gas_price',
          'icm_total',
          'icm_sent',
          'icm_received',
          'usdc_volume',
          'cumulative_tx_count',
          'cumulative_addresses',
          'cumulative_contracts',
          'cumulative_deployers',
        ],
        description: 'Metric to retrieve',
      },
      {
        name: 'granularity',
        kind: 'query',
        type: 'enum',
        required: false,
        default: 'day',
        options: ['hour', 'day', 'week', 'month'],
        description: 'Time granularity',
      },
      {
        name: 'from',
        kind: 'query',
        type: 'date',
        required: false,
        default: '',
        description: 'Start date (YYYY-MM-DD)',
      },
      {
        name: 'to',
        kind: 'query',
        type: 'date',
        required: false,
        default: '',
        description: 'End date (YYYY-MM-DD)',
      },
      {
        name: 'limit',
        kind: 'query',
        type: 'int',
        required: false,
        default: '100',
        min: 1,
        max: 1000,
        description: 'Number of data points (max 1000)',
      },
    ],
    suggestedNext: ['metrics-timeseries-list', 'metrics-chain-stats'],
  },
  // Staking
  {
    id: 'staking',
    method: 'GET',
    path: '/api/v1/metrics/staking',
    title: 'Staking Overview',
    description: 'Primary Network staking: validators, delegations, stake, delegation fees and concentration',
    category: 'Staking',
    params: [],
    notes: [
      'Stake values (own_stake, delegated_stake, total_stake, total_supply) are nAVAX strings: 1 AVAX = 1,000,000,000 nAVAX.',
      'total_supply is the AVAX total supply, not circulating supply. delegation_count counts active delegations, not unique delegators.',
      'concentration gives the top 10, 50 and 100 validators\' share of stake, and the Nakamoto coefficients at 33% and 50%.',
      'Validator data refreshes about every 5 minutes; total_supply about hourly.',
    ],
    suggestedNext: ['staking-unlocks', 'staking-liquid', 'validators'],
  },
  {
    id: 'staking-unlocks',
    method: 'GET',
    path: '/api/v1/metrics/staking/unlocks',
    title: 'Stake Unlocks',
    description: 'AVAX whose staking period ends in each of the coming weeks',
    category: 'Staking',
    params: [
      {
        name: 'weeks',
        kind: 'query',
        type: 'int',
        required: false,
        default: '12',
        min: 1,
        max: 53,
        description: 'Number of weeks ahead (max 53)',
      },
    ],
    notes: [
      'One entry per week starting Monday 00:00 UTC, with empty weeks as zeros. The first week counts only from now onward.',
      'validator_stake and delegated_stake are nAVAX strings.',
    ],
    suggestedNext: ['staking'],
  },
  {
    id: 'staking-liquid',
    method: 'GET',
    path: '/api/v1/metrics/staking/liquid',
    title: 'Liquid Staking',
    description: 'AVAX pooled in liquid staking and how much of it is delegated',
    category: 'Staking',
    params: [],
    notes: [
      'Covers BENQI sAVAX only.',
      'Delegations are matched to the protocol by reward address, which the protocol has not confirmed; attribution says so.',
      'pooled_avax and active_delegated are nAVAX strings; token_supply is in base units (18 decimals); exchange_rate is AVAX per token.',
      'Refreshes about hourly.',
    ],
    suggestedNext: ['staking'],
  },

  {
    id: 'restaking',
    method: 'GET',
    path: '/api/v1/metrics/restaking',
    title: 'Restaking',
    description: 'L1s secured by restaked collateral: validators, weight, operators and vaults',
    category: 'Staking',
    params: [
      {
        name: 'subnet_id',
        kind: 'query',
        type: 'subnetId',
        required: false,
        default: '',
        description: 'Only this L1 (exact subnet ID)',
      },
      {
        name: 'chain_id',
        kind: 'query',
        type: 'string',
        required: false,
        default: '',
        placeholder: '21Ths5Afqi5r4PaoV8r8cruGZWhN11y5rxvy89K8px7pKy3P8E',
        description: 'Only this L1 (exact blockchain ID, CB58)',
      },
    ],
    notes: [
      'Covers Suzaku restaking only.',
      'restaked_weight, total_pchain_weight and module_weight are decimal strings in the L1\'s own validator weight units, not AVAX. share_of_weight_percent is the restaked share of total weight.',
      'Vault amounts (deposited, allocated, idle, limit) are in the collateral token\'s base units; divide by 10^decimals.',
      'An unknown subnet_id or chain_id returns an empty l1s list.',
    ],
    suggestedNext: ['staking', 'chain-risk'],
  },
  // DeFi
  {
    id: 'lending',
    method: 'GET',
    path: '/api/v1/metrics/lending',
    title: 'Lending Markets',
    description: 'Every lending market on Aave V3, Aave V4 and BENQI: supply, borrows, rates, caps and E-Mode',
    category: 'DeFi',
    params: [],
    notes: [
      'A current snapshot, refreshed about every 5 minutes. Not a time series.',
      'total_supplied, total_borrowed and the caps are in the token\'s base units; divide by 10^decimals. A null cap means uncapped.',
      'APYs are variable rates, compounded, in percent. Prices come from each protocol\'s own oracle.',
      'collateral_enabled, ltv_percent and liquidation_threshold_percent are null on Aave V4. On BENQI, asset 0x000...0 means native AVAX.',
      'If a protocol cannot be read, its last good data is kept for up to about 48 hours; check each market\'s sampled_at.',
    ],
  },
  {
    id: 'dex',
    method: 'GET',
    path: '/api/v1/metrics/dex',
    title: 'DEX Volume',
    description: 'Swap volume, swaps and traders for 9 C-Chain DEXes over a window of days',
    category: 'DeFi',
    params: [daysParam('1')],
    notes: [
      'DEXes: Pharaoh V3, Pharaoh DLMM, Uniswap V3, Blackhole CLMM, LFJ (Liquidity Book), LFJ V1, Pangolin V3, Pangolin V2 and SushiSwap V2.',
      'One side of each swap counts. A swap gets a USD value when one side is a USD stablecoin or WAVAX; priced_share is the share of swaps that could be valued (0 to 1).',
      'flagged_swaps counts swaps over $1M; they stay in the volume. unique_addresses counts transaction senders, bots included.',
      WINDOW_NOTE,
    ],
    suggestedNext: ['dex-timeseries', 'dex-pools'],
  },
  {
    id: 'dex-timeseries',
    method: 'GET',
    path: '/api/v1/metrics/dex/timeseries',
    title: 'DEX Volume by Day',
    description: 'Daily swap volume and swaps, in total and per DEX',
    category: 'DeFi',
    params: [daysParam('90')],
    notes: [
      'Oldest first. Days with no swaps are left out, not returned as zero.',
      WINDOW_NOTE,
    ],
    suggestedNext: ['dex', 'dex-pools'],
  },
  {
    id: 'dex-pools',
    method: 'GET',
    path: '/api/v1/metrics/dex/pools',
    title: 'Top DEX Pools',
    description: 'The pools with the most swap volume over a window of days',
    category: 'DeFi',
    params: [daysParam('1', 30), sizedLimitParam('20', 100)],
    notes: [
      'Sorted by volume_usd, highest first. No pagination.',
      'A token\'s symbol is an empty string when it is not known.',
    ],
    suggestedNext: ['dex'],
  },
  {
    id: 'perps',
    method: 'GET',
    path: '/api/v1/metrics/perps',
    title: 'Perpetuals',
    description: 'GMX V2 and V1 perpetuals: volume, long and short, trades, traders, fees and liquidations',
    category: 'DeFi',
    params: [daysParam('30')],
    notes: [
      'volume_usd counts both opening and closing size. fees_usd includes position, borrowing and liquidation fees, not funding.',
      'History starts 2021-12-20. GMX V1 has had no new positions since July 2025.',
      WINDOW_NOTE,
    ],
  },

  // Bridges
  {
    id: 'bridges',
    method: 'GET',
    path: '/api/v1/metrics/bridges',
    title: 'Bridge Flows',
    description: 'Value bridged into and out of Avalanche, by bridge, by chain and by token',
    category: 'Bridges',
    params: [daysParam('30')],
    notes: [
      'Bridges: Circle CCTP, LayerZero OFT, Stargate V2, Avalanche Bridge, Chainlink CCIP and the legacy AEB. Each transfer counts once. History starts 2021-01-25.',
      'net_usd is inflow minus outflow. passthrough_count counts transactions that bridged in and straight back out; they are left out of every other figure.',
      'Stablecoins are priced at $1; ETH, BTC, AVAX and LINK variants at the hourly Chainlink price at the time. Other tokens have no USD value.',
      'chain is not a fixed list: counterparties that are not yet named appear as raw keys such as lz:30999 or cctp:12, and new keys can appear at any time.',
      WINDOW_NOTE,
    ],
  },

  // Interchain (ICM)
  {
    id: 'icm',
    method: 'GET',
    path: '/api/v1/metrics/icm',
    title: 'ICM Overview',
    description: 'Interchain messages sent and received by the C-Chain, in total and by chain',
    category: 'Interchain (ICM)',
    params: [daysParam('30')],
    notes: [
      'Teleporter messages sent from or received on the C-Chain only. Traffic between two L1s that never touches the C-Chain is not included. History starts 2024-03-05.',
      'received counts every delivered message, including ones whose execution failed.',
      WINDOW_NOTE,
    ],
    suggestedNext: ['icm-timeseries', 'icm-apps', 'icm-messages'],
  },
  {
    id: 'icm-timeseries',
    method: 'GET',
    path: '/api/v1/metrics/icm/timeseries',
    title: 'ICM Messages by Day',
    description: 'Daily messages sent and received, by chain and optionally by app',
    category: 'Interchain (ICM)',
    params: [
      daysParam('90'),
      {
        name: 'by_app',
        kind: 'query',
        type: 'boolean',
        required: false,
        default: '',
        description: 'Add a per-app breakdown for each day',
      },
    ],
    notes: ['Oldest first, every day present.'],
    suggestedNext: ['icm', 'icm-apps'],
  },
  {
    id: 'icm-apps',
    method: 'GET',
    path: '/api/v1/metrics/icm/apps',
    title: 'ICM Apps',
    description: 'The C-Chain contracts sending and receiving the most messages',
    category: 'Interchain (ICM)',
    params: [daysParam('30'), sizedLimitParam('50', 200)],
    notes: [
      'kind is ictt-home, ictt-remote or other; token is set for ICTT token bridges only.',
      'first_seen and last_seen are all-time, not limited to the window.',
    ],
    suggestedNext: ['icm-messages', 'icm-value'],
  },
  {
    id: 'icm-messages',
    method: 'GET',
    path: '/api/v1/metrics/icm/messages',
    title: 'ICM Messages',
    description: 'Individual interchain messages, newest first, with filters',
    category: 'Interchain (ICM)',
    params: [
      sizedLimitParam('20', 200),
      {
        name: 'before',
        kind: 'query',
        type: 'string',
        required: false,
        default: '',
        description: 'Cursor for the next page: meta.next_cursor from the previous response',
      },
      {
        name: 'chain',
        kind: 'query',
        type: 'string',
        required: false,
        default: '',
        placeholder: 'axF6i526AKGeduJeA6PQ8ewGQhtLoy2VFgxR9fknWnpf8iiFD',
        description: 'Only messages to or from this blockchain (CB58 ID)',
      },
      {
        name: 'direction',
        kind: 'query',
        type: 'enum',
        required: false,
        default: '',
        options: ['sent', 'received'],
        description: 'Only sent or only received messages',
      },
      {
        name: 'app',
        kind: 'query',
        type: 'string',
        required: false,
        default: '',
        placeholder: '0x...',
        description: 'Only messages for this C-Chain contract',
      },
    ],
    notes: [
      'Near-live. Treat next_cursor as opaque and pass it back unchanged as before.',
      'fee_token and fee_amount are set on sends; deliverer, reward_redeemer and executed on receives. executed=false can mean the execution failed or has not been retried yet.',
      'ictt.amount_raw is the amount as encoded in the message, which can be in the other chain\'s decimals; the value endpoints scale it.',
    ],
    suggestedNext: ['icm-apps', 'icm-transfers-top'],
  },
  {
    id: 'icm-transfers-top',
    method: 'GET',
    path: '/api/v1/metrics/icm/transfers/top',
    title: 'Largest ICM Transfers',
    description: 'The largest token transfers over ICM by USD value',
    category: 'Interchain (ICM)',
    params: [daysParam('30'), sizedLimitParam('50', 200)],
    notes: ['ICTT token transfers with a USD value only. amount is in base units on the C-Chain; usd is the value at the time of the transfer.'],
    suggestedNext: ['icm-value', 'icm-messages'],
  },
  {
    id: 'icm-value',
    method: 'GET',
    path: '/api/v1/metrics/icm/value',
    title: 'ICM Value',
    description: 'USD value of tokens moved over ICM, by token and by chain',
    category: 'Interchain (ICM)',
    params: [daysParam('30')],
    notes: [
      'ICTT token transfers only, counting executed receives.',
      'USD values cover stablecoins and ETH, BTC, AVAX and LINK variants; other tokens count toward transfers with no USD value. priced means the token is on that list; compare priced_transfers with transfers to see how much was valued.',
      WINDOW_NOTE,
    ],
    suggestedNext: ['icm-value-timeseries', 'icm-transfers-top'],
  },
  {
    id: 'icm-value-timeseries',
    method: 'GET',
    path: '/api/v1/metrics/icm/value/timeseries',
    title: 'ICM Value by Day',
    description: 'Daily USD value of tokens moved over ICM, by token',
    category: 'Interchain (ICM)',
    params: [daysParam('90')],
    notes: ['Oldest first, every day present.'],
    suggestedNext: ['icm-value'],
  },

  // AVAX Holdings
  {
    id: 'treasuries',
    method: 'GET',
    path: '/api/v1/treasuries',
    title: 'Treasuries & ETFs',
    description: 'AVAX held by public company treasuries and U.S. spot ETFs, with totals',
    category: 'AVAX Holdings',
    params: [],
    notes: [
      'Each holder has avax_held, as_of (the date the figure is valid for, YYYY-MM-DD) and source: "live" figures are read from the fund or CoinGecko every 6 hours, "manual" ones come from the holder\'s latest report.',
      'ETFs also carry aum_usd, nav_per_share, staking_pct, staking_max_pct and sponsor_fee_pct. Unknown values are null, never 0.',
      'totals sums treasury_avax, etf_avax and combined_avax, with the AVAX price and circulating supply from CoinGecko and the combined share of supply.',
      'DeFi Technologies\' avax_held is an estimate from its latest quarterly report: AVAX held directly plus its Fund A stake, minus the AVAX backing its Valour ETPs.',
      'Cached for 60 seconds. Rate limit: 1,000 requests per 15 minutes per IP.',
    ],
  },
];

export const WS_ENDPOINTS: WsEndpointDef[] = [
  {
    id: 'ws-blocks',
    path: '/ws/blocks/{chainId}',
    title: 'Block Stream',
    description:
      'Stream real-time blocks via WebSocket. Sends initial batch of 10 blocks on connect, then new_block events as they are indexed.',
    category: 'WebSocket',
    params: [
      {
        name: 'chainId',
        kind: 'path',
        type: 'chainId',
        required: true,
        default: '43114',
        description: 'Chain to stream blocks from',
      },
    ],
  },
];

export const FEATURED_QUERIES: FeaturedQuery[] = [
  {
    title: 'Latest C-Chain Blocks',
    description: 'Most recent blocks on Avalanche C-Chain',
    endpointId: 'evm-blocks',
    params: { chainId: '43114', limit: '10' },
    icon: 'Blocks',
  },
  {
    title: 'Active L1 Chains',
    description: 'All live Avalanche L1 blockchains with validator data',
    endpointId: 'chains',
    params: { chain_type: 'l1', active: 'true', limit: '20' },
    icon: 'Network',
  },
  {
    title: 'C-Chain Daily TPS',
    description: '30-day average transactions-per-second history',
    endpointId: 'metrics-timeseries-data',
    params: { chainId: '43114', metric: 'avg_tps', granularity: 'day', limit: '30' },
    icon: 'TrendingUp',
  },
  {
    title: 'L1 Fee Overview',
    description: 'Total validation fees across all L1 subnets',
    endpointId: 'metrics-fees',
    params: {},
    icon: 'DollarSign',
  },
  {
    title: 'Avalanche Stablecoins',
    description: 'Circulating supply, holders, and 24h activity on the C-Chain',
    endpointId: 'evm-stablecoins',
    params: { chainId: '43114' },
    icon: 'DollarSign',
  },
  {
    title: 'C-Chain Fee Burn',
    description: '30-day transaction-fee burn (base fee + priority tip)',
    endpointId: 'metrics-evm-fees-burned',
    params: { chainId: '43114', granularity: 'day', limit: '30' },
    icon: 'TrendingUp',
  },
  {
    title: 'Validator Registrations',
    description: 'Recent L1 validator registration transactions on P-Chain',
    endpointId: 'pchain-txs',
    params: { tx_type: 'RegisterL1Validator', limit: '20' },
    icon: 'ShieldCheck',
  },
  {
    title: 'C-Chain Stats',
    description: 'Aggregate block count, tx count, and gas statistics',
    endpointId: 'metrics-chain-stats',
    params: { chainId: '43114' },
    icon: 'BarChart3',
  },
  {
    title: 'Live Block Stream',
    description: 'Real-time blocks via WebSocket; connects immediately',
    endpointId: 'ws-blocks',
    params: { chainId: '43114' },
    icon: 'Radio',
  },
  {
    title: 'Indexer Status',
    description: 'Sync status of all indexed chains',
    endpointId: 'indexer-status',
    params: {},
    icon: 'Activity',
  },
];

export const ENDPOINT_CATEGORIES: string[] = [
  'WebSocket',
  'Health & System',
  'EVM Data',
  'P-Chain Data',
  'Subnets & Chains',
  'Validators',
  'Metrics - Fees',
  'Metrics - Chain Stats',
  'Staking',
  'DeFi',
  'Bridges',
  'Interchain (ICM)',
  'AVAX Holdings',
];

export function getEndpointById(id: string): EndpointDef | WsEndpointDef | undefined {
  return (
    REST_ENDPOINTS.find((e) => e.id === id) ?? WS_ENDPOINTS.find((e) => e.id === id)
  );
}

export function isWsEndpoint(id: string): boolean {
  return WS_ENDPOINTS.some((e) => e.id === id);
}

export function buildDefaults(
  endpoint: EndpointDef | WsEndpointDef
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const param of endpoint.params) {
    result[param.name] = param.default ?? '';
  }
  return result;
}
