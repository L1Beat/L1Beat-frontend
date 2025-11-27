import { Github, Mail } from 'lucide-react';
import { siX } from 'simple-icons/icons';
import { useTheme } from '../hooks/useTheme';
import { L1BeatLogo } from './L1BeatLogo';

export function Footer() {
  const { theme } = useTheme();
  return (
    <footer className="border-t border-border bg-background text-foreground mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="mb-4">
              <L1BeatLogo size="small" theme={theme} />
            </div>
            <p className="text-sm text-muted-foreground">
              L1Beat provides real-time analytics and monitoring for Avalanche L1s.
            </p>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold mb-4">Resources</h3>
            <ul className="space-y-3">
              <li>
                <a 
                  href="https://docs.avax.network/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-[#ef4444] transition-colors"
                >
                  Avalanche Docs
                </a>
              </li>
              <li>
                <a 
                  href="https://subnets.avax.network/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-[#ef4444] transition-colors"
                >
                  Avalanche Explorer
                </a>
              </li>
              <li>
                <a 
                  href="https://www.avax.network/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-[#ef4444] transition-colors"
                >
                  Avalanche Network
                </a>
              </li>
              <li>
                <a 
                  href="/brand"
                  className="text-sm text-muted-foreground hover:text-[#ef4444] transition-colors"
                >
                  Brand Guide
                </a>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-sm font-semibold mb-4">Connect</h3>
            <div className="flex space-x-4 flex-wrap">
              <a
                href="https://github.com/L1Beat"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="GitHub"
              >
                <Github className="h-6 w-6" />
              </a>
              <a
                href="https://x.com/l1beat_io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="X (Twitter)"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="currentColor"
                >
                  <path d={siX.path} />
                </svg>
              </a>
              <a
                href="https://www.linkedin.com/company/l1beat"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="LinkedIn"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="currentColor"
                >
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
              </a>
              <a
                href="mailto:hello@l1beat.io"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Email"
              >
                <Mail className="h-6 w-6" />
              </a>
            </div>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-border">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Built with ❤️ for the Avalanche community
            </p>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} L1Beat. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
