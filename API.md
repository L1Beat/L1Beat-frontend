# Icicle API Documentation

Production URL: `https://api.l1beat.io`
Local URL: `http://localhost:8080`

**Interactive Documentation**: Open `/api/docs/` in browser for Swagger UI

## API Structure

- **Data API** (`/api/v1/data/*`): Blocks, transactions, chains, validators, P-chain data
- **Metrics API** (`/api/v1/metrics/*`): Fee statistics, daily fee burn, chain metrics, time series data
- **WebSocket** (`/ws/*`): Real-time block streaming
- **System** (`/health`): Health check (no versioning)

## Common Response Format

**Success (list):**
```json
{
  "data": [ ... ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "has_more": true,
    "next_cursor": "54000000",
    "total": 1234567
  }
}
```

**Success (single resource):**
```json
{
  "data": { ... }
}
```

- `has_more` — always present on list endpoints, indicates whether additional results exist beyond this page
- `next_cursor` — present when `has_more` is true on cursor-eligible endpoints; pass as `?cursor=` for the next page
- `total` — only present when `?count=true` is passed; the total number of matching records

**Error:**
```json
{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "Description of the error",
    "details": "Optional extra details",
    "retry_after": 5
  }
}
```

**Error Codes:**
- `INVALID_PARAMETER` — Invalid request parameter (HTTP 400)
- `VALIDATION_FAILED` — Request validation failed (HTTP 400)
- `NOT_FOUND` — Resource not found (HTTP 404)
- `RATE_LIMITED` — Too many requests (HTTP 429, includes `retry_after` seconds)
- `INTERNAL_ERROR` — Server error (HTTP 500)
- `DATABASE_ERROR` — Database error (HTTP 500)

## CORS

All origins are allowed (`Access-Control-Allow-Origin: *`). No authentication is required.

## Rate Limiting

All endpoints are rate limited to 100 requests/second per IP (burst of 100) by default.

When rate limited, you'll receive:
- HTTP 429 status
- `Retry-After` header with seconds to wait
- Error body with `retry_after` field

## Common Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | 20 | Number of results (max 100) |
| `offset` | int | 0 | Pagination offset |
| `cursor` | string | - | Cursor for keyset pagination (use `next_cursor` from previous response) |
| `count` | string | - | Set to `true` to include total count in response |

### Pagination

All list endpoints support **offset-based** pagination (`?limit=20&offset=40`).

Most endpoints also support **cursor-based** pagination, which is more efficient for deep pagination. When a response has `"has_more": true`, the `next_cursor` field contains the value to pass as `?cursor=` for the next page. When using cursor, offset is ignored.

**Cursor-eligible endpoints:** blocks, transactions, address transactions, address internal transactions, P-Chain transactions, chains, validator deposits.

**Offset-only endpoints** (sorted by non-monotonic fields): validators, fee metrics, token balances.

---

## Health

### GET /health

Check API and database connectivity.

**Response:**
```json
{
  "status": "healthy",
  "database": "connected"
}
```

---

## Indexer Status

### GET /api/v1/metrics/indexer/status

Get indexer sync status for all chains. Useful for monitoring and alerting.

**Response:**
```json
{
  "healthy": true,
  "evm": [
    {
      "chain_id": 43114,
      "name": "C-Chain",
      "current_block": 75510573,
      "latest_block": 75538000,
      "blocks_behind": 27427,
      "last_sync": "2025-01-11T08:49:15Z",
      "is_synced": false
    }
  ],
  "pchain": {
    "current_block": 24160141,
    "latest_block": 24160200,
    "blocks_behind": 59,
    "last_sync": "2025-01-11T16:10:16Z",
    "is_synced": true
  },
  "last_update": "2025-01-11T16:15:00Z"
}
```

**Fields:**
- `healthy` — `false` if any chain is >100 blocks behind
- `is_synced` — `true` if chain is <10 blocks behind
- `blocks_behind` — Number of blocks behind the chain tip

---

## Data API - EVM

All EVM data endpoints are prefixed with `/api/v1/data/evm/{chainId}/...`

Common chain IDs:
- `43114` — Avalanche C-Chain

### GET /api/v1/data/evm/{chainId}/blocks

List recent blocks for a chain.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID (e.g., 43114) |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |
| `cursor` | string | Cursor for keyset pagination |
| `count` | string | Set to `true` to include total count |

**Response:**
```json
{
  "data": [
    {
      "chain_id": 43114,
      "block_number": 54000000,
      "hash": "0x1234...abcd",
      "parent_hash": "0xabcd...1234",
      "block_time": "2025-01-08T12:00:00Z",
      "miner": "0x0100000000000000000000000000000000000000",
      "size": 1234,
      "gas_limit": 15000000,
      "gas_used": 8000000,
      "base_fee_per_gas": 25000000000
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "has_more": true,
    "next_cursor": "53999980"
  }
}
```

---

### GET /api/v1/data/evm/{chainId}/blocks/{number}

Get a specific block by number.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |
| `number` | int | Block number |

**Response:**
```json
{
  "data": {
    "chain_id": 43114,
    "block_number": 54000000,
    "hash": "0x1234...abcd",
    "parent_hash": "0xabcd...1234",
    "block_time": "2025-01-08T12:00:00Z",
    "miner": "0x0100000000000000000000000000000000000000",
    "size": 1234,
    "gas_limit": 15000000,
    "gas_used": 8000000,
    "base_fee_per_gas": 25000000000,
    "tx_count": 150
  }
}
```

---

### GET /api/v1/data/evm/{chainId}/txs

List recent transactions for a chain.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |
| `cursor` | string | Cursor for keyset pagination |
| `count` | string | Set to `true` to include total count |

**Response:**
```json
{
  "data": [
    {
      "chain_id": 43114,
      "hash": "0x1234...abcd",
      "block_number": 54000000,
      "block_time": "2025-01-08T12:00:00Z",
      "transaction_index": 0,
      "from": "0xabcd...1234",
      "to": "0x5678...efgh",
      "value": "1000000000000000000",
      "gas_limit": 21000,
      "gas_price": 25000000000,
      "gas_used": 21000,
      "success": true,
      "type": 2
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "has_more": true,
    "next_cursor": "54000000:0"
  }
}
```

**Notes:**
- `to` is `null` for contract creation transactions
- `value` is in wei (string to preserve precision)
- `type`: 0=legacy, 1=EIP-2930, 2=EIP-1559, 3=EIP-4844
- Cursor format for transactions: `block_number:transaction_index`

---

### GET /api/v1/data/evm/{chainId}/txs/{hash}

Get a specific transaction by hash, including internal transactions, token transfers, and approvals.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |
| `hash` | string | Transaction hash (with or without 0x prefix) |

**Response:**
```json
{
  "data": {
    "chain_id": 43114,
    "hash": "0x1234...abcd",
    "block_number": 54000000,
    "block_time": "2025-01-08T12:00:00Z",
    "transaction_index": 0,
    "from": "0xabcd...1234",
    "to": "0x5678...efgh",
    "value": "1000000000000000000",
    "gas_limit": 21000,
    "gas_price": 25000000000,
    "gas_used": 21000,
    "success": true,
    "type": 2,
    "internal_txs": [
      {
        "trace_index": "0,1",
        "from": "0x5678...efgh",
        "to": "0x9abc...def0",
        "value": "500000000000000000",
        "gas_used": 10000,
        "call_type": "CALL",
        "success": true
      }
    ],
    "token_transfers": [
      {
        "token": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
        "name": "USD Coin",
        "symbol": "USDC",
        "decimals": 6,
        "from": "0xabcd...1234",
        "to": "0x5678...efgh",
        "value": "1000000",
        "log_index": 5
      }
    ],
    "approvals": [
      {
        "token": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
        "name": "USD Coin",
        "symbol": "USDC",
        "decimals": 6,
        "owner": "0xabcd...1234",
        "spender": "0x5678...efgh",
        "amount": "1000000",
        "is_unlimited": false,
        "log_index": 3
      }
    ]
  }
}
```

**Notes:**
- `internal_txs` — internal call traces within the transaction (empty array if none)
- `token_transfers` — ERC-20 Transfer events (empty array if none)
- `approvals` — ERC-20 Approval events (empty array if none)
- `name`, `symbol`, `decimals` on token transfers/approvals are optional (only if token metadata known)

---

### GET /api/v1/data/evm/{chainId}/address/{address}/txs

Get transactions for a specific address (as sender or receiver).

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |
| `address` | string | Ethereum address (with or without 0x prefix) |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |
| `cursor` | string | Cursor for keyset pagination |
| `count` | string | Set to `true` to include total count |

**Response:** Same format as `GET /txs` (array of Transaction objects).

---

### GET /api/v1/data/evm/{chainId}/address/{address}/internal-txs

Get internal transactions (traces) for a specific address.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |
| `address` | string | Ethereum address (with or without 0x prefix) |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |
| `cursor` | string | Cursor for keyset pagination |
| `count` | string | Set to `true` to include total count |

**Response:**
```json
{
  "data": [
    {
      "tx_hash": "0x1234...abcd",
      "block_number": 54000000,
      "block_time": "2025-01-08T12:00:00Z",
      "trace_index": "0,1",
      "from": "0xabcd...1234",
      "to": "0x5678...efgh",
      "value": "1000000000000000000",
      "gas_used": 21000,
      "call_type": "CALL",
      "success": true
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

**Notes:**
- Only includes traces with value > 0 or CREATE/CREATE2 types
- `trace_index` shows the path in the call tree (e.g., "0,1" = first call's second subcall)
- `to` is `null` for CREATE/CREATE2

---

### GET /api/v1/data/evm/{chainId}/address/{address}/balances

Get ERC-20 token balances for an address.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |
| `address` | string | Wallet address (with or without 0x prefix) |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |
| `count` | string | Set to `true` to include total count |

**Response:**
```json
{
  "data": [
    {
      "token": "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e",
      "name": "USD Coin",
      "symbol": "USDC",
      "decimals": 6,
      "balance": "1000000",
      "total_in": "2000000",
      "total_out": "1000000",
      "last_updated_block": 77048918
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

**Notes:**
- Only returns tokens with balance > 0
- `name`, `symbol`, `decimals` are optional (only included if token metadata is available)
- Balance values are in token's smallest unit (e.g., 6 decimals for USDC)
- Offset-only pagination (no cursor support)

---

### GET /api/v1/data/evm/{chainId}/address/{address}/native

Get native token balance (AVAX, ETH, etc.) for an address.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |
| `address` | string | Wallet address (with or without 0x prefix) |

**Response:**
```json
{
  "data": {
    "total_in": "1000000000000000000",
    "total_out": "500000000000000000",
    "total_gas": "21000000000000",
    "balance": "499979000000000000",
    "last_updated_block": 77048918,
    "tx_count": 788432,
    "first_tx_time": "2020-09-23T11:02:19Z",
    "last_tx_time": "2026-02-02T10:15:33Z"
  }
}
```

**Notes:**
- All values in wei (string to preserve precision)
- `first_tx_time` and `last_tx_time` only included when `tx_count` > 0
- Returns zeros if address has no history

---

## Data API - P-Chain

### GET /api/v1/data/pchain/txs

List P-Chain transactions.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `tx_type` | string | Filter by transaction type |
| `subnet_id` | string | Filter by subnet ID (CB58) |
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |
| `cursor` | string | Cursor for keyset pagination |
| `count` | string | Set to `true` to include total count |

**Response:**
```json
{
  "data": [
    {
      "tx_id": "22FdhKfCTTW...xxNeV",
      "tx_type": "RegisterL1ValidatorTx",
      "block_number": 12345678,
      "block_time": "2024-12-01T00:00:00Z",
      "tx_data": {
        "Balance": 2000000000000,
        "Signer": { "...": "..." },
        "ValidationID": "3DEF...uvw"
      }
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "has_more": true,
    "next_cursor": "12345678"
  }
}
```

**Common Transaction Types:**
- `CreateSubnetTx` — Create a new subnet
- `CreateChainTx` — Create a blockchain in a subnet
- `AddValidatorTx` — Add validator to primary network
- `AddDelegatorTx` — Add delegator to primary network
- `ConvertSubnetToL1Tx` — Convert subnet to L1
- `RegisterL1ValidatorTx` — Register L1 validator
- `IncreaseL1ValidatorBalanceTx` — Top up validator balance
- `DisableL1ValidatorTx` — Disable L1 validator
- `SetL1ValidatorWeightTx` — Change validator weight

---

### GET /api/v1/data/pchain/txs/{txId}

Get a specific P-Chain transaction by ID.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `txId` | string | Transaction ID (CB58) |

**Response:** Same format as single item in `GET /pchain/txs` response, wrapped in `{"data": {...}}`.

---

### GET /api/v1/data/pchain/tx-types

Get all P-Chain transaction types with counts.

**Response:**
```json
{
  "data": [
    { "tx_type": "AddDelegatorTx", "count": 150000 },
    { "tx_type": "AddValidatorTx", "count": 50000 },
    { "tx_type": "RegisterL1ValidatorTx", "count": 1200 }
  ]
}
```

---

## Data API - Subnets

### GET /api/v1/data/subnets/{subnetId}

Get subnet details with chains and registry metadata.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `subnetId` | string | Subnet ID (CB58) |

**Response:**
```json
{
  "data": {
    "subnet": {
      "subnet_id": "2ABC...xyz",
      "subnet_type": "l1",
      "created_block": 10000000,
      "created_time": "2024-01-01T00:00:00Z",
      "chain_id": "2DEF...uvw",
      "converted_block": 12000000,
      "converted_time": "2024-06-01T00:00:00Z"
    },
    "chains": [
      {
        "chain_id": "2DEF...uvw",
        "subnet_id": "2ABC...xyz",
        "chain_name": "My Chain",
        "vm_id": "srEXiWaH...",
        "created_block": 10000001,
        "created_time": "2024-01-01T00:01:00Z"
      }
    ],
    "registry": {
      "subnet_id": "2ABC...xyz",
      "name": "My L1",
      "description": "A description",
      "logo_url": "https://example.com/logo.png",
      "website_url": "https://example.com"
    }
  }
}
```

**Notes:**
- `chain_id`, `converted_block`, `converted_time` are omitted if the subnet hasn't been converted to L1
- `registry` is `null` if no L1 registry metadata exists
- **Subnet Types:** `regular`, `elastic`, `l1`

---

## Data API - Chains

### GET /api/v1/data/chains

List all blockchains with enriched subnet, L1 registry, and validator data. This is the primary endpoint for listing L1s and chains.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chain_type` | string | Filter by type: `l1` or `legacy` |
| `subnet_id` | string | Filter by subnet ID |
| `category` | string | Filter by category (e.g., `DeFi`, `Gaming`) — case-insensitive |
| `active` | string | Set to `true` to only show chains with active validators |
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |
| `cursor` | string | Cursor for keyset pagination |
| `count` | string | Set to `true` to include total count |

**Response:**
```json
{
  "data": [
    {
      "chain_id": "2q9e4r6Mu...",
      "chain_name": "My Chain",
      "vm_id": "srEXiWaH...",
      "created_block": 10000001,
      "created_time": "2024-01-01T00:01:00Z",
      "subnet_id": "2ABC...xyz",
      "chain_type": "l1",
      "converted_block": 12000000,
      "converted_time": "2024-06-01T00:00:00Z",
      "name": "My L1",
      "description": "A high-performance L1",
      "logo_url": "https://example.com/logo.png",
      "website_url": "https://example.com",
      "evm_chain_id": 12345,
      "categories": ["DeFi", "Gaming"],
      "socials": [
        { "name": "twitter", "url": "https://twitter.com/mychain" }
      ],
      "rpc_url": "https://rpc.mychain.com",
      "explorer_url": "https://explorer.mychain.com",
      "sybil_resistance_type": "ProofOfAuthority",
      "network_token": {
        "name": "My Token",
        "symbol": "MTK",
        "decimals": 18,
        "logo_uri": "https://example.com/token.png"
      },
      "network": "mainnet",
      "validator_count": 10,
      "active_validators": 8,
      "total_staked": 5000000,
      "total_fees_paid": 1500000000000
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "has_more": true,
    "next_cursor": "10000001"
  }
}
```

**Notes:**
- All registry fields (`name`, `description`, `logo_url`, `website_url`, `evm_chain_id`, `categories`, `socials`, `rpc_url`, `explorer_url`, `sybil_resistance_type`, `network_token`, `network`) are optional — only present if registry metadata exists
- `converted_block`, `converted_time` only present for L1-converted subnets
- `validator_count`, `active_validators`, `total_staked`, `total_fees_paid` only present for L1 chains
- `socials` is an array of `{"name": string, "url": string}` objects
- `network_token` includes native token info when available

---

## Data API - Validators

### GET /api/v1/data/validators

List validators (L1 and legacy subnet validators).

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `subnet_id` | string | Filter by subnet ID (CB58) |
| `active` | string | Set to `true` for active only |
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |
| `count` | string | Set to `true` to include total count |

**Response:**
```json
{
  "data": [
    {
      "subnet_id": "2ABC...xyz",
      "validation_id": "3DEF...uvw",
      "node_id": "NodeID-ABC123...",
      "weight": 100000,
      "start_time": "2024-12-01T00:00:00Z",
      "active": true,
      "end_time": "2025-12-01T00:00:00Z",
      "uptime_percentage": 99.5,
      "balance": 1000000000000,
      "initial_deposit": 2000000000000,
      "total_topups": 500000000000,
      "refund_amount": 0,
      "fees_paid": 1500000000000
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

**Notes:**
- All balance/fee values in nAVAX (1 AVAX = 1,000,000,000 nAVAX)
- `end_time` — omitted for L1 validators with no expiry
- `uptime_percentage` — omitted for L1 validators (not meaningful)
- `balance`, `initial_deposit`, `total_topups`, `refund_amount`, `fees_paid` — only present for L1 validators
- Offset-only pagination (no cursor support)
- Legacy subnet validators may include `primary_stake` and `primary_uptime` from Primary Network

---

### GET /api/v1/data/validators/{id}

Get detailed validator info by validation ID or node ID.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Validation ID or Node ID (e.g., `NodeID-ABC123...`) |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `subnet_id` | string | Disambiguate when a node validates multiple subnets |

**Response:**
```json
{
  "data": {
    "subnet_id": "2ABC...xyz",
    "validation_id": "3DEF...uvw",
    "node_id": "NodeID-ABC123...",
    "weight": 100000,
    "start_time": "2024-12-01T00:00:00Z",
    "active": true,
    "balance": 1000000000000,
    "initial_deposit": 2000000000000,
    "total_topups": 500000000000,
    "refund_amount": 0,
    "fees_paid": 1500000000000,
    "tx_hash": "22FdhK...xxNeV",
    "tx_type": "RegisterL1ValidatorTx",
    "created_block": 12345678,
    "created_time": "2024-12-01T00:00:00Z",
    "bls_public_key": "0x85abcd...",
    "remaining_balance_owner": "P-avax1abc...",
    "total_deposited": 2500000000000,
    "days_remaining": 45.2,
    "estimated_days_left": 22.6,
    "daily_fee_burn": 44236800,
    "network_share_percent": 12.5,
    "delegation_fee_percent": 2.0,
    "delegator_count": 150,
    "total_delegated": 50000000000000,
    "total_stake": 52000000000000
  }
}
```

**Detail-only fields (not in list endpoint):**
- `tx_hash`, `tx_type` — Registration transaction info
- `created_block`, `created_time` — When the validator was registered
- `bls_public_key` — BLS public key
- `remaining_balance_owner` — P-Chain address (bech32 format, e.g., `P-avax1...`)
- `total_deposited` — Total amount ever deposited (initial + topups)
- `days_remaining` — Days until balance runs out at 512 nAVAX/sec burn rate
- `estimated_days_left` — Estimated days remaining based on current balance
- `daily_fee_burn` — Daily fee burn in nAVAX (512 nAVAX/sec = 44,236,800 nAVAX/day per validator)
- `network_share_percent` — This validator's weight as % of subnet total
- `delegation_fee_percent`, `delegator_count`, `total_delegated`, `total_stake` — Primary Network delegation data (only for Primary Network validators)

---

### GET /api/v1/data/validators/{id}/deposits

Get deposit history for a validator.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Validation ID or Node ID |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |
| `cursor` | string | Cursor for keyset pagination |
| `count` | string | Set to `true` to include total count |

**Response:**
```json
{
  "data": [
    {
      "tx_id": "22FdhK...xxNeV",
      "tx_type": "RegisterL1Validator",
      "block_number": 12345678,
      "block_time": "2024-12-01T00:00:00Z",
      "amount": 2000000000000
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

**Notes:**
- `amount` in nAVAX
- `tx_type` values: `RegisterL1Validator` (initial deposit), `IncreaseL1ValidatorBalance` (top-up)

---

## Metrics API - Fees

### GET /api/v1/metrics/fees

Get L1 validation fee statistics per subnet, plus an aggregated summary.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `subnet_id` | string | Filter by subnet ID |
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |
| `count` | string | Set to `true` to include total count |

**Response:**
```json
{
  "data": [
    {
      "subnet_id": "2ABC...xyz",
      "total_deposited": 100000000000000,
      "initial_deposits": 80000000000000,
      "top_up_deposits": 20000000000000,
      "total_refunded": 5000000000000,
      "current_balance": 15000000000000,
      "total_fees_paid": 80000000000000,
      "deposit_tx_count": 150,
      "validator_count": 50
    }
  ],
  "meta": {
    "limit": 20,
    "offset": 0,
    "has_more": true
  },
  "summary": {
    "total_deposited": 500000000000000,
    "total_refunded": 25000000000000,
    "total_fees_paid": 400000000000000,
    "current_balance": 75000000000000,
    "subnet_count": 10,
    "validator_count": 200
  }
}
```

**Notes:**
- `summary` is **always** included — aggregated totals across ALL L1 subnets (not just the current page)
- All values in nAVAX
- Offset-only pagination (no cursor support)

---

### GET /api/v1/metrics/fees/daily

Get daily fee burn data for an L1 subnet, computed from validator active periods (512 nAVAX/sec per validator).

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `subnet_id` | string | **Yes** | Subnet ID (CB58) |
| `days` | int | No | Number of days (default: all days since first validator) |
| `validators` | string | No | Set to `true` to include per-validator breakdown |

**Response:**
```json
{
  "data": [
    {
      "date": "2025-01-15",
      "total_fees_burned": 221184000,
      "active_validators": 5,
      "validators": [
        {
          "validation_id": "2ZW6HUePB...",
          "node_id": "NodeID-P7oB2McjBGgW...",
          "fees_burned": 44236800,
          "active_seconds": 86400
        }
      ]
    }
  ]
}
```

**Notes:**
- `validators` array only included when `?validators=true` is passed
- `date` format is `YYYY-MM-DD`
- Fee burn = `active_seconds * 512` nAVAX
- Full day = 86400 seconds = 44,236,800 nAVAX per validator
- Returns empty array if no validators exist for the subnet

---

## Metrics API - Chain Stats

### GET /api/v1/metrics/evm/{chainId}/stats

Get aggregate statistics for a chain.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |

**Response:**
```json
{
  "data": {
    "chain_id": 43114,
    "chain_name": "C-Chain",
    "latest_block": 54000000,
    "total_blocks": 54000000,
    "total_txs": 250000000,
    "last_block_time": "2025-01-08T12:00:00Z",
    "avg_block_time_seconds": 2.0,
    "avg_gas_used": 8000000,
    "total_gas_used": 432000000000000
  }
}
```

---

## Metrics API - Time Series

### GET /api/v1/metrics/evm/{chainId}/timeseries

List available metrics for a chain.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |

**Response:**
```json
{
  "data": [
    {
      "metric_name": "tx_count",
      "granularities": ["hour", "day", "week"],
      "latest_period": "2025-01-15T00:00:00Z",
      "data_points": 365
    },
    {
      "metric_name": "active_addresses",
      "granularities": ["day", "week"],
      "latest_period": "2025-01-15T00:00:00Z",
      "data_points": 180
    }
  ]
}
```

---

### GET /api/v1/metrics/evm/{chainId}/timeseries/{metric}

Get time series data for a specific metric.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |
| `metric` | string | Metric name (see list below) |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `granularity` | string | day | Time granularity: `hour`, `day`, `week`, `month` |
| `from` | string | - | Start time (date `YYYY-MM-DD`, RFC3339, or unix timestamp) |
| `to` | string | - | End time (date `YYYY-MM-DD`, RFC3339, or unix timestamp) |
| `limit` | int | 100 | Number of data points (max 1000) |

**Available Metrics:**
- `tx_count` — Transaction count
- `active_addresses` — Unique active addresses
- `active_senders` — Unique senders
- `fees_paid` — Total fees in wei
- `gas_used` — Total gas used
- `contracts` — New contracts deployed
- `deployers` — Unique contract deployers
- `avg_tps` — Average transactions per second
- `max_tps` — Maximum transactions per second
- `avg_gps` — Average gas per second
- `max_gps` — Maximum gas per second
- `avg_gas_price` — Average gas price
- `max_gas_price` — Maximum gas price
- `icm_total` — Total ICM messages
- `icm_sent` — ICM messages sent
- `icm_received` — ICM messages received
- `usdc_volume` — USDC transfer volume
- `cumulative_tx_count` — Cumulative transaction count
- `cumulative_addresses` — Cumulative unique addresses
- `cumulative_contracts` — Cumulative contracts deployed
- `cumulative_deployers` — Cumulative unique deployers

**Response:**
```json
{
  "data": {
    "chain_id": 43114,
    "metric_name": "tx_count",
    "granularity": "day",
    "data": [
      { "period": "2025-01-01T00:00:00Z", "value": 123456 },
      { "period": "2025-01-02T00:00:00Z", "value": 234567 }
    ]
  }
}
```

---

## WebSocket API

### WS /ws/blocks/{chainId}

Stream real-time blocks for a chain via WebSocket.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `chainId` | int | Chain ID |

**Connection:**
```javascript
const ws = new WebSocket('wss://api.l1beat.io/ws/blocks/43114');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg.type, msg.data);
};
```

**Message Types:**

1. **initial** — Sent on connection with last 10 blocks:
```json
{
  "type": "initial",
  "data": [
    {
      "chain_id": 43114,
      "block_number": 54000000,
      "hash": "0x1234...abcd",
      "parent_hash": "0xabcd...1234",
      "block_time": "2025-01-08T12:00:00Z",
      "miner": "0x0100...",
      "size": 1234,
      "gas_limit": 15000000,
      "gas_used": 8000000,
      "base_fee_per_gas": 25000000000,
      "tx_count": 150
    }
  ]
}
```

2. **new_block** — Sent when a new block is indexed:
```json
{
  "type": "new_block",
  "data": {
    "chain_id": 43114,
    "block_number": 54000001,
    "hash": "0x5678...efgh",
    "parent_hash": "0x1234...abcd",
    "block_time": "2025-01-08T12:00:02Z",
    "miner": "0x0100...",
    "size": 2345,
    "gas_limit": 15000000,
    "gas_used": 9000000,
    "base_fee_per_gas": 26000000000,
    "tx_count": 200
  }
}
```

3. **ping** — Keepalive sent every 30 seconds:
```json
{
  "type": "ping"
}
```

**Notes:**
- Blocks are polled every 500ms
- Connection times out after 60s of inactivity (respond to pings)
- Use `wss://` for HTTPS servers, `ws://` for HTTP

---

## Complete Endpoint Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/metrics/indexer/status` | Indexer sync status |
| GET | `/api/v1/data/evm/{chainId}/blocks` | List blocks |
| GET | `/api/v1/data/evm/{chainId}/blocks/{number}` | Get block by number |
| GET | `/api/v1/data/evm/{chainId}/txs` | List transactions |
| GET | `/api/v1/data/evm/{chainId}/txs/{hash}` | Get transaction detail |
| GET | `/api/v1/data/evm/{chainId}/address/{address}/txs` | Address transactions |
| GET | `/api/v1/data/evm/{chainId}/address/{address}/internal-txs` | Address internal txs |
| GET | `/api/v1/data/evm/{chainId}/address/{address}/balances` | ERC-20 token balances |
| GET | `/api/v1/data/evm/{chainId}/address/{address}/native` | Native token balance |
| GET | `/api/v1/data/pchain/txs` | List P-Chain transactions |
| GET | `/api/v1/data/pchain/txs/{txId}` | Get P-Chain transaction |
| GET | `/api/v1/data/pchain/tx-types` | P-Chain transaction type counts |
| GET | `/api/v1/data/subnets/{subnetId}` | Get subnet details |
| GET | `/api/v1/data/chains` | List chains (unified) |
| GET | `/api/v1/data/validators` | List validators |
| GET | `/api/v1/data/validators/{id}` | Get validator detail |
| GET | `/api/v1/data/validators/{id}/deposits` | Validator deposit history |
| GET | `/api/v1/metrics/fees` | L1 fee statistics |
| GET | `/api/v1/metrics/fees/daily` | Daily fee burn |
| GET | `/api/v1/metrics/evm/{chainId}/stats` | Chain aggregate stats |
| GET | `/api/v1/metrics/evm/{chainId}/timeseries` | List available metrics |
| GET | `/api/v1/metrics/evm/{chainId}/timeseries/{metric}` | Get time series data |
| WS | `/ws/blocks/{chainId}` | Real-time block stream |

---

## Examples

```bash
# Health check
curl https://api.l1beat.io/health

# Indexer status (for monitoring)
curl https://api.l1beat.io/api/v1/metrics/indexer/status

# === EVM Data (C-Chain = 43114) ===

# Get latest blocks
curl "https://api.l1beat.io/api/v1/data/evm/43114/blocks?limit=10"

# Get specific block
curl "https://api.l1beat.io/api/v1/data/evm/43114/blocks/54000000"

# Get latest transactions
curl "https://api.l1beat.io/api/v1/data/evm/43114/txs?limit=10"

# Get transaction by hash (includes internal txs, transfers, approvals)
curl "https://api.l1beat.io/api/v1/data/evm/43114/txs/0x1234..."

# Get address transactions
curl "https://api.l1beat.io/api/v1/data/evm/43114/address/0xabcd.../txs"

# Get address internal transactions
curl "https://api.l1beat.io/api/v1/data/evm/43114/address/0xabcd.../internal-txs"

# Get address ERC-20 balances
curl "https://api.l1beat.io/api/v1/data/evm/43114/address/0xabcd.../balances"

# Get address native balance
curl "https://api.l1beat.io/api/v1/data/evm/43114/address/0xabcd.../native"

# === EVM Metrics ===

# Get chain stats
curl "https://api.l1beat.io/api/v1/metrics/evm/43114/stats"

# List available metrics
curl "https://api.l1beat.io/api/v1/metrics/evm/43114/timeseries"

# Get daily transaction count (last 30 days)
curl "https://api.l1beat.io/api/v1/metrics/evm/43114/timeseries/tx_count?granularity=day&limit=30"

# Get hourly active addresses with time range
curl "https://api.l1beat.io/api/v1/metrics/evm/43114/timeseries/active_addresses?granularity=hour&from=2025-01-01&to=2025-01-07"

# === P-Chain Data ===

# List P-Chain transactions
curl "https://api.l1beat.io/api/v1/data/pchain/txs?limit=20"

# Filter by type
curl "https://api.l1beat.io/api/v1/data/pchain/txs?tx_type=RegisterL1ValidatorTx"

# Get transaction by ID
curl "https://api.l1beat.io/api/v1/data/pchain/txs/22FdhKfCTTW...xxNeV"

# Get transaction type counts
curl "https://api.l1beat.io/api/v1/data/pchain/tx-types"

# === Chains & Subnets ===

# List all chains (unified endpoint with registry + validator data)
curl "https://api.l1beat.io/api/v1/data/chains"

# List L1 chains only
curl "https://api.l1beat.io/api/v1/data/chains?chain_type=l1"

# List chains with active validators
curl "https://api.l1beat.io/api/v1/data/chains?active=true"

# Filter by category
curl "https://api.l1beat.io/api/v1/data/chains?category=DeFi"

# Get subnet details
curl "https://api.l1beat.io/api/v1/data/subnets/2ABC...xyz"

# === Validators ===

# List active validators
curl "https://api.l1beat.io/api/v1/data/validators?active=true"

# Filter by subnet
curl "https://api.l1beat.io/api/v1/data/validators?subnet_id=2ABC...xyz"

# Get validator details (by node ID or validation ID)
curl "https://api.l1beat.io/api/v1/data/validators/NodeID-ABC123..."

# Get validator deposits
curl "https://api.l1beat.io/api/v1/data/validators/NodeID-ABC123.../deposits"

# === Fee Metrics ===

# Get fee stats for all L1s (includes summary totals)
curl "https://api.l1beat.io/api/v1/metrics/fees"

# Get fee stats for specific L1
curl "https://api.l1beat.io/api/v1/metrics/fees?subnet_id=2ABC...xyz"

# Get daily fee burn for a subnet
curl "https://api.l1beat.io/api/v1/metrics/fees/daily?subnet_id=2ABC...xyz"

# Get daily fee burn with per-validator breakdown
curl "https://api.l1beat.io/api/v1/metrics/fees/daily?subnet_id=2ABC...xyz&validators=true&days=30"

# === WebSocket ===

# Connect to block stream (use wscat or browser)
wscat -c "wss://api.l1beat.io/ws/blocks/43114"
```
