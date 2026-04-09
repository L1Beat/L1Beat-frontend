import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WsEndpointDef } from './endpointCatalog';
import { SmartParamInput } from './SmartParamInput';
import { PLAYGROUND_WS_BASE } from './constants';

type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WsBlock {
  id: string;
  chain_id: number;
  block_number: number;
  hash: string;
  block_time: string;
  miner: string;
  size: number;
  gas_limit: number;
  gas_used: number;
  base_fee_per_gas: number;
  tx_count: number;
  receivedAt: number;
}

interface RawMessage {
  id: string;
  type: string;
  data: unknown;
  ts: number;
}

interface WebSocketPanelProps {
  endpoint: WsEndpointDef;
  params: Record<string, string>;
  onParamChange: (name: string, value: string) => void;
}

function StatusDot({ status }: { status: WsStatus }) {
  const colors: Record<WsStatus, string> = {
    disconnected: 'bg-muted-foreground',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  };
  const labels: Record<WsStatus, string> = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    connected: 'Live',
    error: 'Error',
  };
  const textColors: Record<WsStatus, string> = {
    disconnected: 'text-muted-foreground',
    connecting: 'text-yellow-600 dark:text-yellow-400',
    connected: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
  };
  return (
    <div className="flex items-center gap-2">
      <span
        className={`w-2 h-2 rounded-full ${colors[status]} ${
          status === 'connected' ? 'animate-pulse' : ''
        }`}
      />
      <span className={`text-sm font-medium ${textColors[status]}`}>
        {labels[status]}
      </span>
    </div>
  );
}

export function WebSocketPanel({
  endpoint,
  params,
  onParamChange,
}: WebSocketPanelProps) {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const [blocks, setBlocks] = useState<WsBlock[]>([]);
  const [msgCount, setMsgCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'raw'>('cards');
  const [rawMessages, setRawMessages] = useState<RawMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const isUserConnectedRef = useRef(false);

  const chainId = params.chainId || '43114';
  const wsUrl = `${PLAYGROUND_WS_BASE}/ws/blocks/${chainId}`;

  const disconnect = useCallback(() => {
    isUserConnectedRef.current = false;
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  const connect = useCallback(() => {
    isUserConnectedRef.current = true;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('connecting');
    setErrorMsg(null);
    setBlocks([]);
    setRawMessages([]);
    setMsgCount(0);

    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setStatus('connected');
    };

    socket.onmessage = (e: MessageEvent<string>) => {
      let msg: { type: string; data?: unknown };
      try {
        msg = JSON.parse(e.data) as { type: string; data?: unknown };
      } catch {
        return;
      }

      if (msg.type === 'ping') return;

      if (msg.type === 'initial') {
        const initialBlocks = (msg.data as Array<Record<string, unknown>>).map((b) => ({
          id: crypto.randomUUID(),
          receivedAt: Date.now(),
          chain_id: Number(b.chain_id ?? 0),
          block_number: Number(b.block_number ?? 0),
          hash: String(b.hash ?? ''),
          block_time: String(b.block_time ?? ''),
          miner: String(b.miner ?? ''),
          size: Number(b.size ?? 0),
          gas_limit: Number(b.gas_limit ?? 0),
          gas_used: Number(b.gas_used ?? 0),
          base_fee_per_gas: Number(b.base_fee_per_gas ?? 0),
          tx_count: Number(b.tx_count ?? 0),
        }));
        setBlocks(initialBlocks.reverse());
        setMsgCount(initialBlocks.length);
      } else if (msg.type === 'new_block') {
        const b = msg.data as Record<string, unknown>;
        const block: WsBlock = {
          id: crypto.randomUUID(),
          receivedAt: Date.now(),
          chain_id: Number(b.chain_id ?? 0),
          block_number: Number(b.block_number ?? 0),
          hash: String(b.hash ?? ''),
          block_time: String(b.block_time ?? ''),
          miner: String(b.miner ?? ''),
          size: Number(b.size ?? 0),
          gas_limit: Number(b.gas_limit ?? 0),
          gas_used: Number(b.gas_used ?? 0),
          base_fee_per_gas: Number(b.base_fee_per_gas ?? 0),
          tx_count: Number(b.tx_count ?? 0),
        };
        setBlocks((prev) => [block, ...prev].slice(0, 50));
        setMsgCount((c) => c + 1);
      }

      // Always capture raw messages regardless of current view mode
      setRawMessages((prev) =>
        [
          {
            id: crypto.randomUUID(),
            type: msg.type,
            data: msg.data,
            ts: Date.now(),
          },
          ...prev,
        ].slice(0, 100)
      );
    };

    socket.onerror = () => {
      setStatus('error');
      setErrorMsg('WebSocket connection failed. Check your network or the chain ID.');
    };

    socket.onclose = () => {
      setStatus((prev) => (prev === 'connected' ? 'disconnected' : prev));
    };

    wsRef.current = socket;
  }, [wsUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Auto-reconnect when the chain changes while the user is connected
  useEffect(() => {
    if (isUserConnectedRef.current) {
      connect();
    }
  }, [connect]);

  const latestBlock = blocks[0];

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="bg-purple-500/15 text-purple-600 dark:text-purple-400 text-xs font-mono px-1.5 py-0.5 rounded">
            WS
          </span>
          <code className="text-sm font-mono text-foreground">{endpoint.path}</code>
        </div>
        <p className="text-sm text-muted-foreground">{endpoint.description}</p>
      </div>

      {/* Chain picker + connect */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4" style={{ boxShadow: 'var(--card-shadow)' }}>
        <div className="space-y-4">
          {endpoint.params.map((param) => (
            <SmartParamInput
              key={param.name}
              param={param}
              value={params[param.name] ?? param.default ?? ''}
              onChange={(v) => onParamChange(param.name, v)}
              hasError={false}
            />
          ))}
        </div>

        {/* URL preview */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
          <span className="font-mono text-xs text-muted-foreground flex-shrink-0">URL</span>
          <span className="font-mono text-xs text-foreground truncate">{wsUrl}</span>
        </div>

        {/* Connect/Disconnect */}
        <div className="flex items-center gap-3">
          {status === 'disconnected' || status === 'error' ? (
            <button
              onClick={connect}
              className="px-4 py-2 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-lg text-sm font-medium transition-colors"
            >
              Connect
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="px-4 py-2 bg-muted hover:bg-muted/70 border border-border text-foreground rounded-lg text-sm font-medium transition-colors"
            >
              Disconnect
            </button>
          )}
          <StatusDot status={status} />
          {errorMsg && (
            <span className="text-xs text-red-600 dark:text-red-400">{errorMsg}</span>
          )}
        </div>
      </div>

      {/* Live stats */}
      {status === 'connected' && (
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-600 dark:text-green-400 font-medium">Live</span>
          <span className="text-muted-foreground">
            · {msgCount} blocks received
            {latestBlock && (
              <> · Latest #{latestBlock.block_number.toLocaleString()}</>
            )}
          </span>
        </div>
      )}

      {/* View toggle + clear */}
      {blocks.length > 0 || rawMessages.length > 0 ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'cards'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                viewMode === 'raw'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Raw JSON
            </button>
          </div>
          <button
            onClick={() => {
              setBlocks([]);
              setRawMessages([]);
              setMsgCount(0);
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      ) : null}

      {/* Cards view */}
      {viewMode === 'cards' && (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {blocks.map((block) => (
              <motion.div
                key={block.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-card border border-border rounded-xl p-4"
                style={{ boxShadow: 'var(--card-shadow)' }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">
                      #{block.block_number.toLocaleString()}
                    </span>
                    {block.receivedAt > Date.now() - 3000 && (
                      <motion.span
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        transition={{ delay: 2, duration: 0.5 }}
                        className="text-xs px-1.5 py-0.5 rounded bg-green-500/15 text-green-600 dark:text-green-400"
                      >
                        NEW
                      </motion.span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(block.block_time).toUTCString().slice(0, -4)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{block.tx_count} txs</span>
                  <span>{(block.gas_used / 1_000_000).toFixed(1)}M gas used</span>
                  <span>{(block.base_fee_per_gas / 1e9).toFixed(1)} Gwei</span>
                  <span>{block.size.toLocaleString()} bytes</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground font-mono truncate">
                  Miner: {block.miner}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {blocks.length === 0 && status === 'connected' && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Waiting for blocks...
            </div>
          )}
        </div>
      )}

      {/* Raw JSON view */}
      {viewMode === 'raw' && (
        <div className="space-y-2">
          {rawMessages.map((msg) => (
            <div
              key={msg.id}
              className="bg-card border border-border rounded-lg p-3 font-mono text-xs"
              style={{ boxShadow: 'var(--card-shadow)' }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-muted-foreground">
                  {new Date(msg.ts).toLocaleTimeString()}
                </span>
                <span className="text-[#60a5fa]">{msg.type}</span>
              </div>
              <pre className="text-foreground overflow-x-auto whitespace-pre-wrap break-all text-[11px]">
                {JSON.stringify(msg.data, null, 2)}
              </pre>
            </div>
          ))}
          {rawMessages.length === 0 && status === 'connected' && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Waiting for messages...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
