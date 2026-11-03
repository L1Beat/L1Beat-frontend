import { Link } from 'react-router-dom';
import { Github, Mail } from 'lucide-react';
import { siX } from 'simple-icons/icons';
import { useTheme } from '../hooks/useTheme';
import { L1BeatLogo } from './L1BeatLogo';

type FooterLink = { label: string; to?: string; href?: string };

// Every page is listed here: on phones the dock only carries seven of them.
const GROUPS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Data',
    links: [
      { label: 'Overview', to: '/' },
      { label: 'Metrics', to: '/metrics' },
      { label: 'Interchain', to: '/interchain' },
      { label: 'Stablecoins', to: '/stablecoins' },
      { label: 'Staking', to: '/staking' },
      { label: 'Treasuries & ETFs', to: '/treasuries' },
      { label: 'Trading', to: '/trading' },
      { label: 'Perpetuals', to: '/perps' },
      { label: 'Lending', to: '/lending' },
      { label: 'Bridges', to: '/bridges' },
      { label: 'Burn', to: '/burn' },
    ],
  },
  {
    title: 'Protocol',
    links: [
      { label: 'ACPs', to: '/acps' },
      { label: 'Blog', to: '/blog' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'API', to: '/api' },
      { label: 'Brand', to: '/brand' },
      { label: 'GitHub', href: 'https://github.com/L1Beat' },
    ],
  },
  {
    title: 'Avalanche',
    links: [
      { label: 'Docs', href: 'https://docs.avax.network/' },
      { label: 'Explorer', href: 'https://subnets.avax.network/' },
      { label: 'avax.network', href: 'https://www.avax.network/' },
    ],
  },
];

const linkCls = 'text-[13px] leading-6 text-muted-foreground transition-colors hover:text-foreground';

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={siX.path} />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

const SOCIALS = [
  { label: 'GitHub', href: 'https://github.com/L1Beat', Icon: Github },
  { label: 'X (Twitter)', href: 'https://x.com/l1beat_io', Icon: XIcon },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/l1beat', Icon: LinkedInIcon },
  { label: 'Email', href: 'mailto:hello@l1beat.io', Icon: Mail },
];

export function Footer() {
  const { theme } = useTheme();
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-auto border-t border-border bg-background text-foreground">
      <div className="relative mx-auto max-w-7xl 2xl:max-w-screen-2xl px-4 sm:px-6">
        {/* The L1Beat pulse, drawn into the footer's top rule. */}
        <svg
          aria-hidden
          viewBox="0 0 56 20"
          className="absolute -top-[10px] left-4 sm:left-6 w-14 h-5 text-muted-foreground/50"
          fill="none"
        >
          <path d="M0 10H18L22 3L28 17L32 10H56" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
        </svg>

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 pt-10 pb-8 md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
          <div className="col-span-2 md:col-span-1 max-w-xs">
            <div className="w-fit">
              <L1BeatLogo size="small" theme={theme} />
            </div>
            <p className="mt-3 text-[13px] leading-5 text-muted-foreground">
              Analytics for Avalanche and its L1s.
            </p>
            <div className="mt-4 -ml-1.5 flex items-center gap-1">
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={label}
                  aria-label={label}
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {GROUPS.map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <h2 className="text-[12px] font-medium text-foreground mb-2">{g.title}</h2>
              <ul>
                {g.links.map((l) => (
                  <li key={l.label}>
                    {l.to ? (
                      <Link to={l.to} className={linkCls}>{l.label}</Link>
                    ) : (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkCls}>{l.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-t border-border py-4 text-[11px] text-muted-foreground">
          <p>
            © <span className="num">{year}</span> L1Beat
          </p>
        </div>
      </div>
    </footer>
  );
}
