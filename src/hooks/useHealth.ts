import { useState } from 'react';
import { getHealth } from '../api';
import { HealthStatus } from '../types';
import { usePolling } from './usePolling';

const POLL_INTERVAL = 5 * 60 * 1000;

export function useHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  usePolling(() => {
    getHealth().then(setHealth).catch(() => {});
  }, POLL_INTERVAL);

  return health;
}
