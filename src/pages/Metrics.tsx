import { useEffect, useState } from 'react';
import { AvalancheNetworkMetrics } from '../components/AvalancheNetworkMetrics';
import { ChainSpecificMetrics } from '../components/ChainSpecificMetrics';
import { ComparisonView } from '../components/comparison';
import { Footer } from '../components/Footer';
import { getL1BeatFeeMetrics } from '../api';

export function Metrics() {
  const [validatorCountBySubnet, setValidatorCountBySubnet] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchData() {
      try {
        const feeData = await getL1BeatFeeMetrics();
        const counts: Record<string, number> = {};
        feeData.forEach((f) => { counts[f.subnet_id] = f.validator_count; });
        setValidatorCountBySubnet(counts);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    }

    fetchData();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">

      <main className="max-w-7xl mx-auto px-6 py-12 space-y-12">
        {/* Network-Wide Metrics */}
        <AvalancheNetworkMetrics />

        {/* Chain-Specific Metrics */}
        <ChainSpecificMetrics />

        {/* Chain Comparison */}
        <section>
          <ComparisonView validatorCountBySubnet={validatorCountBySubnet} />
        </section>
      </main>

      <Footer />
    </div>
  );
}

