import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

// Where people usually meant to go.
const PLACES = [
  { label: 'Overview', to: '/', note: 'Every Avalanche L1 at a glance' },
  { label: 'Interchain', to: '/interchain', note: 'Messages between L1s and the C-Chain' },
  { label: 'Staking', to: '/staking', note: 'Primary Network validators and delegators' },
  { label: 'ACPs', to: '/acps', note: 'Avalanche Community Proposals' },
];

export function NotFound() {
  return (
    <div className="flex-1 bg-background">
      <Helmet>
        <title>Page not found | L1Beat</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <p className="num text-[13px] text-muted-foreground">404</p>
        <h1 className="mt-2 text-[26px] sm:text-[34px] leading-tight font-medium text-foreground max-w-3xl">
          There's no page at this address.
        </h1>
        <p className="mt-1.5 text-[15px] sm:text-[17px] leading-snug text-foreground/80 max-w-2xl">
          The link may be old or mistyped. Search with <span className="num">⌘K</span>, or start from one of these.
        </p>
        <ul className="mt-8 grid max-w-3xl grid-cols-1 sm:grid-cols-2 border-t border-border">
          {PLACES.map((p) => (
            <li key={p.to} className="border-b border-border">
              <Link
                to={p.to}
                className="flex flex-col gap-0.5 py-3 pr-4 transition-colors hover:bg-accent/40 focus-visible:bg-accent/40"
              >
                <span className="text-[14px] font-medium text-foreground">{p.label}</span>
                <span className="text-[12px] text-muted-foreground">{p.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
