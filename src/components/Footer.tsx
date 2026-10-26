import { Link } from 'react-router-dom';
import { Github, Mail, Heart } from 'lucide-react';
import { siX } from 'simple-icons/icons';
import { useTheme } from '../hooks/useTheme';
import { L1BeatLogo } from './L1BeatLogo';

// External references only — internal pages already live in the sidebar.
const RESOURCES: { label: string; href: string }[] = [
  { label: 'Avalanche Docs', href: 'https://docs.avax.network/' },
  { label: 'Avalanche Explorer', href: 'https://subnets.avax.network/' },
  { label: 'Avalanche Network', href: 'https://www.avax.network/' },
];

const linkCls = 'text-[12px] text-muted-foreground transition-colors hover:text-foreground';

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
    <footer className="mt-auto border-t border-border bg-background text-foreground">
      <div className="mx-auto max-w-7xl 2xl:max-w-screen-2xl px-4 sm:px-6">
        {/* One row: identity on the left, destinations on the right. */}
        <div className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <L1BeatLogo size="small" theme={theme} />
            <p className="text-[12px] text-muted-foreground truncate">
              Real-time analytics for every Avalanche L1. Alpha: data may be incomplete.
            </p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Footer">
            {RESOURCES.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                {l.label}
              </a>
            ))}
            <Link to="/brand" className={linkCls}>Brand</Link>
            <span aria-hidden className="hidden sm:block w-px h-4 bg-border" />
            <div className="flex items-center gap-1">
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={label}
                  aria-label={label}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
          </nav>
        </div>

        <div className="flex flex-col gap-2 border-t border-border py-3 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © <span className="num">{year}</span> L1Beat. All rights reserved.
          </p>
          <p className="flex items-center gap-1.5">
            Built with
            <Heart className="h-3 w-3 fill-current" />
            for the Avalanche community
          </p>
        </div>
      </div>
    </footer>
  );
}
