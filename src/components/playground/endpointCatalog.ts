export type ParamKind = 'path' | 'query';
export type ParamType = 'string' | 'int' | 'boolean' | 'enum' | 'date' | 'chainId';

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
  description: 'Cursor for keyset pagination — use next_cursor from previous response',
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
          'CreateSubnetTx',
          'CreateChainTx',
          'AddValidatorTx',
          'AddDelegatorTx',
          'ConvertSubnetToL1Tx',
          'RegisterL1ValidatorTx',
          'IncreaseL1ValidatorBalanceTx',
          'DisableL1ValidatorTx',
          'SetL1ValidatorWeightTx',
        ],
        description: 'Filter by transaction type',
      },
      {
        name: 'subnet_id',
        kind: 'query',
        type: 'string',
        required: false,
        default: '',
        placeholder: '2ABC...xyz',
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
    params: [],
    suggestedNext: ['pchain-txs'],
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
        type: 'string',
        required: true,
        default: '',
        placeholder: '2ABC...xyz',
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
        description: 'Filter by category (e.g. DeFi, Gaming) — case-insensitive',
      },
      limitParam(100),
      offsetParam,
      cursorParam,
      countParam,
    ],
    suggestedNext: ['validators', 'metrics-fees', 'metrics-chain-stats'],
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
        type: 'string',
        required: false,
        default: '',
        placeholder: '2ABC...xyz',
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
    notes: ['Offset-only pagination (no cursor support)'],
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
        type: 'string',
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
        type: 'string',
        required: false,
        default: '',
        placeholder: '2ABC...xyz',
        description: 'Filter by subnet ID',
      },
      limitParam(100),
      offsetParam,
      countParam,
    ],
    notes: ['summary field always present — aggregated totals across ALL L1 subnets'],
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
        type: 'string',
        required: true,
        default: '',
        placeholder: '2ABC...xyz',
        description: 'Subnet ID — required',
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
    title: 'Validator Registrations',
    description: 'Recent L1 validator registration transactions on P-Chain',
    endpointId: 'pchain-txs',
    params: { tx_type: 'RegisterL1ValidatorTx', limit: '20' },
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
    description: 'Real-time blocks via WebSocket — connects immediately',
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
