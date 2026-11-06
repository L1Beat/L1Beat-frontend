import { SEO } from '../components/SEO';
import { PAGE_SEO } from '../utils/pageSeo';
import { SectionErrorBoundary } from '../components/SectionErrorBoundary';
import { ComparisonView } from '../components/comparison';
import type { CompareSummary } from '../components/comparison';
import { headline } from '../components/comparison/headline';

function Heading({ summary }: { summary: CompareSummary | null }) {
  const text = summary ? headline(summary) : null;
  return (
    <>
      <h1 className="text-[18px] leading-6 font-semibold text-foreground">Compare chains</h1>
      {text ? (
        <>
          <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">{text.lead}</p>
          {text.detail && (
            <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-3xl">{text.detail}</p>
          )}
        </>
      ) : summary && summary.rows.length === 0 ? (
        <p className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-4xl">
          Pick up to four L1s to put side by side.
        </p>
      ) : summary ? (
        <p className="mt-2 text-[17px] text-muted-foreground">
          {summary.failed
            ? "The figures didn't load. Try again in a minute."
            : 'These chains have no data for this metric in the selected window.'}
        </p>
      ) : (
        <div className="mt-3 h-9 w-[min(560px,80vw)] rounded bg-muted animate-pulse" />
      )}
    </>
  );
}

export function Compare() {
  return (
    <div>
      <SEO {...PAGE_SEO.compare} />
      <SectionErrorBoundary label="chain comparison">
        <ComparisonView renderHeading={(summary) => <Heading summary={summary} />} />
      </SectionErrorBoundary>
    </div>
  );
}
