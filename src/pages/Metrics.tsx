import React from 'react';
import { StatusBar } from '../components/StatusBar';
import { AvalancheNetworkMetrics } from '../components/AvalancheNetworkMetrics';
import { ChainSpecificMetrics } from '../components/ChainSpecificMetrics';
import { getHealth } from '../api';
import { useEffect, useState } from 'react';
import { HealthStatus } from '../types';
import { BarChart3 } from 'lucide-react';

export function Metrics() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const healthData = await getHealth();
        setHealth(healthData);
      } catch (err) {
        console.error('Failed to fetch health:', err);
      }
    }

    fetchHealth();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StatusBar health={health} />

      <main className="max-w-7xl mx-auto px-6 py-12 space-y-12">
        {/* Network-Wide Metrics */}
        <AvalancheNetworkMetrics />

        {/* Chain-Specific Metrics */}
        <ChainSpecificMetrics />
      </main>
    </div>
  );
}

