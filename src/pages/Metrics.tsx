import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AvalancheNetworkMetrics } from '../components/AvalancheNetworkMetrics';
import { ChainSpecificMetrics } from '../components/ChainSpecificMetrics';
import { ComparisonView } from '../components/comparison';
import { Footer } from '../components/Footer';
import { getChains, getL1BeatActiveValidatorCounts } from '../api';
import { GitCompareArrows } from 'lucide-react';

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

  const [showCompareButton, setShowCompareButton] = useState(true);

  // Auto-scroll to comparison section when URL has compare params
  useEffect(() => {
    if (hasScrolled.current || !searchParams.has('compare')) return;
    hasScrolled.current = true;
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

  // Hide button when comparison section is visible
  useEffect(() => {
    const el = comparisonRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShowCompareButton(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">

      <main className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-6 py-12 space-y-12">
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

      {/* Floating Compare Button */}
      {showCompareButton && (
        <button
          onClick={() => comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="fixed bottom-6 md:bottom-8 right-6 md:right-8 z-40 flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#ef4444] text-white text-sm font-semibold shadow-lg shadow-[#ef4444]/25 hover:bg-[#dc2626] transition-all duration-200 hover:scale-105 active:scale-95"
        >
          <GitCompareArrows className="w-4 h-4" />
          <span className="hidden sm:inline">Compare Chains</span>
        </button>
      )}
    </div>
  );
}
