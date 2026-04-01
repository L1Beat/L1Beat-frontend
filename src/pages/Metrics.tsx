import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AvalancheNetworkMetrics } from '../components/AvalancheNetworkMetrics';
import { ChainSpecificMetrics } from '../components/ChainSpecificMetrics';
import { ComparisonView } from '../components/comparison';
import { Footer } from '../components/Footer';
import { getChains, getL1BeatActiveValidatorCounts } from '../api';

export function Metrics() {
  const [validatorCountBySubnet, setValidatorCountBySubnet] = useState<Record<string, number>>({});
  const [searchParams] = useSearchParams();
  const comparisonRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const chains = await getChains();
        const subnetIds = chains.map(c => c.subnetId).filter(Boolean) as string[];
        const counts = await getL1BeatActiveValidatorCounts(subnetIds);
        setValidatorCountBySubnet(counts);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    }

    fetchData();
  }, []);

  // Auto-scroll to comparison section when URL has compare params
  useEffect(() => {
    if (hasScrolled.current || !searchParams.has('compare')) return;
    hasScrolled.current = true;
    // Retry scroll until the element is in the right position (content may still be loading)
    let attempts = 0;
    const tryScroll = () => {
      if (comparisonRef.current && attempts < 10) {
        comparisonRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        attempts++;
        setTimeout(tryScroll, 500);
      }
    };
    setTimeout(tryScroll, 500);
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background text-foreground">

      <main className="max-w-7xl mx-auto px-6 py-12 space-y-12">
        {/* Network-Wide Metrics */}
        <AvalancheNetworkMetrics />

        {/* Chain-Specific Metrics */}
        <ChainSpecificMetrics />

        {/* Chain Comparison */}
        <section ref={comparisonRef}>
          <ComparisonView validatorCountBySubnet={validatorCountBySubnet} />
        </section>
      </main>

      <Footer />
    </div>
  );
}
