import { useEffect, useState } from 'react';
import { getHealth } from '../api';
import { HealthStatus } from '../types';

const POLL_INTERVAL = 5 * 60 * 1000;

export function useHealth() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(() => {});
    const interval = setInterval(() => {
      getHealth().then(setHealth).catch(() => {});
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return health;
}
