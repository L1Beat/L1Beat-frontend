// src/pages/ACPDetails.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useTheme } from '../hooks/useTheme';
import 'katex/dist/katex.min.css';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SEO } from '../components/SEO';
import { NotFoundMeta } from '../components/NotFoundMeta';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft,
  ArrowUpCircle,
  Users,
  Clock,
  Github,
  Link as LinkIcon,
  List,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  Info
} from 'lucide-react';
import { acpService } from '../services/acpService';
import { ComplexityDots } from '../components/acp/AcpStatus';
import { AcpStatusChip } from '../components/acp/AcpStatusChip';
import type { Author, EnhancedACP } from '../types';

// Lazy-load mermaid (and its diagram renderers + cytoscape) only when an ACP
// actually contains a diagram. Keeps ~1MB+ out of the main bundle for every
// other page. The import promise is cached so it only downloads once.
type MermaidApi = typeof import('mermaid')['default'];
let mermaidPromise: Promise<MermaidApi> | null = null;
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  return mermaidPromise;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

interface TocItem {
  id: string;
  title: string;
  level: 2 | 3;
}

function extractTocHeadings(content: string): TocItem[] {
  if (!content) return [];
  const lines = content.split('\n');
  let inFence = false;
  const out: TocItem[] = [];
  const seen = new Set<string>();
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const level = match[1].length as 2 | 3;
    const title = match[2].trim();
    if (!title) continue;
    let id = slugify(title);
    if (!id) continue;
    let n = 2;
    const base = id;
    while (seen.has(id)) {
      id = `${base}-${n++}`;
    }
    seen.add(id);
    out.push({ id, title, level });
  }
  return out;
}
/**
 * Splits the metadata table every ACP opens with from the body, as [key, value]
 * rows. The side card shows them, so the body starts at the abstract.
 */
function splitPreamble(content: string): { rows: [string, string][]; body: string } {
  const lines = (content || '').replace(/\r/g, '').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  const rows: [string, string][] = [];
  while (i < lines.length && lines[i].trim().startsWith('|')) {
    const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length >= 2 && !/^:?-+:?$/.test(cells[0])) rows.push([cells[0].replace(/\*\*/g, ''), cells.slice(1).join('|').trim()]);
    i++;
  }
  return rows.length ? { rows, body: lines.slice(i).join('\n') } : { rows: [], body: content };
}

/** Links between ACPs point at ../13-name/README.md in the repo; on L1Beat they open /acps/13. */
function acpRoute(href?: string): string | null {
  const m = href?.match(/(?:^|\/)(\d+)-[^/]*\/README\.md$/i) ?? href?.match(/^\.\.\/(\d+)-[^/]*\/?$/);
  return m ? `/acps/${Number(m[1])}` : null;
}

function MdLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const route = acpRoute(href);
  const cls = 'text-foreground underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground';
  return route ? (
    <Link to={route} className={cls}>{children}</Link>
  ) : (
    <a href={href} className={cls} target="_blank" rel="noopener noreferrer">{children}</a>
  );
}

const preprocessContent = (content: string) => {
  return content
    // Only escape very specific, obvious currency tokens - be extremely conservative
    // "2000 $AVAX ($70k at time of writing)": two prices, not a formula.
    .replace(/\$AVAX \(\$/g, '&#36;AVAX (&#36;')
    .replace(/\$AVAX(?!\s*[+\-*/=<>≥≤\\{}()^_])/g, '&#36;AVAX')
    .replace(/\$AVAX-([A-Za-z][A-Za-z\-]*)/g, '&#36;AVAX-$1')
    .replace(/\$ETH(?!\s*[+\-*/=<>≥≤\\{}()^_])/g, '&#36;ETH')
    .replace(/\$ETH-([A-Za-z][A-Za-z\-]*)/g, '&#36;ETH-$1')
    .replace(/\n*\[!NOTE\]\s*(.*?)(?=\n\n|\n(?=[A-Z])|$)/gs, (_match, noteContent) => {
      return `\n\n:::note\n${noteContent.trim()}\n\n\n`;
    })
    // Convert [WARNING] blocks if they exist
    .replace(/\n*\[!WARNING\]\s*(.*?)(?=\n\n|\n(?=[A-Z])|$)/gs, (_match, warningContent) => {
      return `\n\n:::warning\n${warningContent.trim()}\n\n\n`;
    })
    .replace(/<div[^>]*>/g, '')
    .replace(/<\/div>/g, '');
};

export default function ACPDetails() {
  const { acpNumber } = useParams<{ acpNumber: string }>();
  const navigate = useNavigate();
  const [acp, setAcp] = useState<EnhancedACP | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTocId, setActiveTocId] = useState<string>('');

  const tocItems = useMemo(() => extractTocHeadings(acp?.content || ''), [acp?.content]);

  // Dynamically load syntax highlighter only on client side
  const [SyntaxHighlighter, setSyntaxHighlighter] = useState<any>(null);
  const [syntaxStyles, setSyntaxStyles] = useState<any>({ vscDarkPlus: {}, oneLight: {} });

  useEffect(() => {
    // Only load on client side
    if (typeof window !== 'undefined') {
      import('../utils/codeHighlighter').then(({ SyntaxHighlighter: Highlighter, vscDarkPlus, oneLight }) => {
        setSyntaxHighlighter(() => Highlighter);
        setSyntaxStyles({ vscDarkPlus, oneLight });
      }).catch(err => console.error('Failed to load syntax highlighter:', err));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    
    async function fetchACP() {
      if (!acpNumber || !mounted) return;
      
      try {
        setLoading(true);
        setError(null);

        console.log(`Loading ACP-${acpNumber} from local data...`);
        const acpData = await acpService.loadACPByNumber(acpNumber);

        if (!mounted) return;

        if (!acpData) {
          setError(`ACP-${acpNumber} not found`);
          return;
        }

        setAcp(acpData);
      } catch (err) {
        if (!mounted) return;
        console.error(`Error loading ACP-${acpNumber}:`, err);
        setError(err instanceof Error ? err.message : `Failed to load ACP-${acpNumber}`);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchACP();

    return () => {
      mounted = false;
    };
  }, [acpNumber]);

  useEffect(() => {
    if (tocItems.length === 0) return;

    const TOP_OFFSET = 96;

    const update = () => {
      let active = tocItems[0]?.id || '';
      for (const item of tocItems) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - TOP_OFFSET <= 0) {
          active = item.id;
        } else {
          break;
        }
      }
      setActiveTocId(active);
    };

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [tocItems, acp?.number]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };


// code blocks and mermaid diagrams 

  const CodeBlock = ({ children, className, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const language = match ? match[1] : '';
    const content = String(children).trim();
    
    // Get current theme
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Check if this is a mermaid diagram
    const isMermaid = language === 'mermaid' || 
                    content.includes('flowchart') || 
                    content.includes('graph') || 
                    content.includes('sequenceDiagram') || 
                    content.includes('classDiagram');

    if (isMermaid) {
      const chartIdRef = React.useRef(`mermaid-chart-${Math.random().toString(36).substr(2, 9)}`);
      const chartId = chartIdRef.current;
      
      React.useEffect(() => {
        const renderChart = async () => {
          try {
            const element = document.getElementById(chartId);
            if (element) {
              element.innerHTML = `<div class="flex justify-center items-center min-h-[200px] ${isDark ? 'text-muted-foreground' : 'text-muted-foreground'}">
                <div class="flex items-center space-x-2">
                  <div class="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
                  <span>Rendering diagram...</span>
                </div>
              </div>`;
              
              const cleanContent = content.trim();
              const uniqueId = `svg-${chartId}-${Date.now()}`;

              try {
                const mermaid = await loadMermaid();
                // (Re-)initialize with the active theme before each render so
                // diagrams pick up light/dark colors correctly.
                const themeVariables = isDark ? {
                  // Dark mode - Force high contrast node colors
                  primaryColor: '#1e293b',
                  primaryTextColor: '#ffffff',
                  primaryBorderColor: '#94a3b8',
                  lineColor: '#e2e8f0',
                  secondaryColor: '#334155',
                  tertiaryColor: '#475569',
                  mainBkg: '#1e293b',
                  nodeBkg: '#1e293b',
                  nodeTextColor: '#ffffff',
                } : {
                  // Light mode - Default clear colors
                  primaryColor: '#ffffff',
                  primaryTextColor: '#0f172a',
                  primaryBorderColor: '#334155',
                  lineColor: '#334155',
                  secondaryColor: '#f1f5f9',
                  tertiaryColor: '#e2e8f0',
                  mainBkg: '#ffffff',
                  nodeBkg: '#ffffff',
                  nodeTextColor: '#0f172a',
                };
                mermaid.initialize({
                  startOnLoad: false,
                  theme: 'base',
                  securityLevel: 'loose',
                  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                  themeVariables,
                  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
                  sequence: { useMaxWidth: true },
                });
                const { svg } = await mermaid.render(uniqueId, cleanContent);
                element.innerHTML = svg;
              } catch (renderError) {
                console.error('Mermaid render failed:', renderError);
                element.innerHTML = `
                  <div class="border-2 border-dashed border-red-500/20 bg-red-500/10 text-red-600 rounded p-4">
                    <p class="font-medium mb-2">Failed to render diagram</p>
                    <pre class="text-xs bg-card p-2 rounded overflow-auto border border-border">${cleanContent}</pre>
                  </div>
                `;
              }
            }
          } catch (error) {
            console.error('Mermaid wrapper error:', error);
          }
        };
        
        const timeoutId = setTimeout(renderChart, 100);
        return () => clearTimeout(timeoutId);
      }, [chartId, content, isDark]); // Re-render on theme change

      return (
        <div className="my-8 p-4 rounded-md border border-border bg-card shadow-sm overflow-hidden transition-colors duration-200">
          <div id={chartId} className="flex justify-center min-h-[150px] items-center w-full overflow-x-auto" />
        </div>
      );
    }

    // Regular code blocks with improved styling
    if (match) {
      const [isCopied, setIsCopied] = React.useState(false);

      const handleCopy = async () => {
        await navigator.clipboard.writeText(content);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      };

      return (
        <div className="my-6 rounded-md overflow-hidden border border-border bg-card shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium font-mono text-muted-foreground">
                {match[1]}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md transition-all duration-200 text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-foreground/30"
              title="Copy code"
            >
              {isCopied ? (
                <Check className="w-4 h-4 text-up" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="relative group">
            {SyntaxHighlighter ? (
              <SyntaxHighlighter
                style={isDark ? syntaxStyles.vscDarkPlus : syntaxStyles.oneLight}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  padding: '1.5rem',
                  background: 'transparent',
                  fontSize: '0.875rem',
                  lineHeight: '1.6',
                }}
                codeTagProps={{
                  style: { fontFamily: 'JetBrains Mono, monospace' }
                }}
              >
                {content}
              </SyntaxHighlighter>
            ) : (
              <pre className="p-6 overflow-x-auto bg-muted rounded-b">
                <code className="text-foreground text-sm font-mono">{content}</code>
              </pre>
            )}
          </div>
        </div>
      );
    }

    return (
      <code className="px-1.5 py-0.5 rounded text-sm font-mono bg-muted text-foreground" {...props}>
        {children}
      </code>
    );
  };



  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <h2 className="text-lg font-semibold text-foreground mt-4 mb-2">
              Loading ACP-{acpNumber}...
            </h2>
            <p className="text-muted-foreground">
              Fetching proposal details from local data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !acp) {
    // Only a confirmed miss is "not found"; a failed load says so and keeps the page indexable.
    const missing = error === `ACP-${acpNumber} not found`;
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        {missing ? (
          <NotFoundMeta title={`ACP-${acpNumber} not found`} />
        ) : (
          <Helmet><title>{`ACP-${acpNumber} | L1Beat`}</title></Helmet>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-red-600" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              {missing ? 'ACP Not Found' : 'Could not load this ACP'}
            </h2>
            <p className="text-muted-foreground mb-4">
              {error || `ACP-${acpNumber} could not be found.`}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/acps')}
                className="inline-flex items-center px-4 py-2 border border-border rounded-md shadow-sm text-sm font-medium text-foreground bg-muted hover:bg-accent hover:border-foreground/30 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to ACPs
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center h-8 px-3 rounded bg-foreground text-background hover:bg-foreground/90 text-[13px] font-medium"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const githubUrl = `https://github.com/avalanche-foundation/ACPs/blob/main/ACPs/${acp.folderName || acp.number}/README.md`;
  const preamble = splitPreamble(acp.content);

  return (
    <div className="bg-background text-foreground">
      <SEO
        title={`ACP-${acp.number} · ${acp.title}`}
        description={`${acp.status ? `${acp.status} · ` : ''}${acp.track ? `${acp.track} track · ` : ''}Avalanche Community Proposal ${acp.number}.`}
        url={`/acps/${acp.number}`}
      />
      <div className="max-w-7xl 2xl:max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <button
            onClick={() => navigate('/acps')}
            className="inline-flex items-center gap-1.5 h-7 px-2 -ml-2 mb-3 text-[12px] rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All ACPs
          </button>

          {/* Compact header: number and status, title, authors, actions. */}
          <header className="border-b border-border pb-5 mb-6">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="num text-[13px] text-muted-foreground">ACP-{acp.number}</span>
              <AcpStatusChip status={acp.status} size="md" />
              {acp.track && <span className="text-[12px] text-muted-foreground">{acp.track.replace(/ Track$/, '')} track</span>}
            </div>
            <h1 className="mt-2 text-[26px] sm:text-[34px] font-medium text-foreground leading-tight max-w-4xl">
              <ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>{acp.title}</ReactMarkdown>
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
              <span className="inline-flex items-start gap-1.5 text-muted-foreground">
                <Users className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
                <span>
                {acp.authors?.length ? (
                  acp.authors.map((author: Author, index: number) => (
                    <React.Fragment key={index}>
                      {index > 0 && ', '}
                      <a
                        href={author.url || `https://github.com/${author.github}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground hover:underline underline-offset-4"
                      >
                        {author.name}
                      </a>
                    </React.Fragment>
                  ))
                ) : (
                  'Unknown'
                )}
                </span>
              </span>
              {acp.readingTime ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-4 h-4" aria-hidden />
                  {acp.readingTime} min read
                </span>
              ) : null}
              <span className="flex-1" />
              <div className="flex gap-2">
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-7 px-3 rounded text-[12px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors"
                >
                  <Github className="w-3.5 h-3.5" />
                  GitHub
                </a>
                {acp.discussion && (
                  <a
                    href={acp.discussion}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-7 px-3 border border-border rounded text-[12px] font-medium text-foreground hover:bg-accent transition-colors"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    Discussion
                  </a>
                )}
                <button
                  onClick={copyToClipboard}
                  className="inline-flex items-center gap-1.5 h-7 px-3 border border-border rounded text-[12px] font-medium text-foreground hover:bg-accent transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-up" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            </div>
          </header>

          {/* Content + right rail */}
          <div className="lg:flex lg:gap-8 lg:items-start">
          <div className="flex-1 min-w-0">
            <div className="lg:hidden mb-6">
              <MetaCard acp={acp} rows={preamble.rows} githubUrl={githubUrl} />
            </div>
            {/* About 75 characters a line at the body size. */}
            <div className="max-w-[75ch] break-words text-[15px] [&>h2:first-child]:mt-0">
            <ReactMarkdown
  remarkPlugins={[remarkGfm, remarkMath]}
  rehypePlugins={[rehypeKatex]}
  components={{
    code: CodeBlock,
    a: ({ href, children }) => <MdLink href={href}>{children}</MdLink>,
    h1: ({ children, ...props }) => (
      <h1 {...props} className="mt-10 mb-4 text-[26px] leading-tight font-semibold text-foreground">
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => {
      const text = React.Children.toArray(children)
        .map((c) => (typeof c === 'string' ? c : ''))
        .join('')
        .trim();
      const id = slugify(text);
      return (
        <h2
          {...props}
          id={id || undefined}
          className="mt-10 mb-3 text-[22px] leading-snug font-semibold text-foreground scroll-mt-24"
        >
          {children}
        </h2>
      );
    },
    h3: ({ children, ...props }) => {
      const text = React.Children.toArray(children)
        .map((c) => (typeof c === 'string' ? c : ''))
        .join('')
        .trim();
      const id = slugify(text);
      return (
        <h3
          {...props}
          id={id || undefined}
          className="mt-8 mb-2.5 text-[17px] leading-snug font-semibold text-foreground scroll-mt-24"
        >
          {children}
        </h3>
      );
    },
    h4: ({ children, ...props }) => (
      <h4 {...props} className="mt-6 mb-2 text-[15px] font-semibold text-foreground">
        {children}
      </h4>
    ),
    ul: ({ children, ...props }) => (
      <ul {...props} className="my-4 ml-6 list-disc space-y-1.5 leading-7 text-foreground/80">
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol {...props} className="my-4 ml-6 list-decimal space-y-1.5 leading-7 text-foreground/80">
        {children}
      </ol>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        {...props}
        className="my-6 border-l-2 border-border pl-4 py-1 text-muted-foreground"
      >
        {children}
      </blockquote>
    ),
    table: ({ children, ...props }) => (
      <div className="my-6 overflow-x-auto">
        <table {...props} className="min-w-full border-collapse text-[13px]">
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th {...props} className="border border-border bg-muted px-4 py-2 text-left font-semibold text-foreground">
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td {...props} className="border border-border px-4 py-2 text-muted-foreground">
        {children}
      </td>
    ),
    // Custom image handler to fix relative paths
    img: ({ node, ...props }) => {
      let src = props.src || '';
      // If relative path, prepend GitHub raw URL
      if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
        const baseUrl = `https://raw.githubusercontent.com/avalanche-foundation/ACPs/main/ACPs/${acp.folderName || acp.number}`;
        const cleanPath = src.replace(/^\.\//, ''); // Remove leading ./
        src = `${baseUrl}/${cleanPath}`;
      }
      return (
        <img
          {...props}
          src={src}
          className="max-w-full h-auto rounded shadow-md my-8 border border-border block mx-auto bg-card"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            console.warn('Failed to load image:', src);
          }}
        />
      );
    },
    // Handle custom note blocks
    div: ({ children, className, ...props }) => {
      // Pass through regular divs
      return <div className={className} {...props}>{children}</div>;
    },
    p: ({ children, ...props }) => {
      const text = String(children);
      
      // Check if this paragraph starts with our note syntax
      if (text.startsWith(':::note')) {
        const noteContent = text.replace(/^:::note\s*/, '').replace(/:::$/, '');
        return (
          <div className="my-6 rounded-md border border-border bg-muted/40">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 text-muted-foreground mt-0.5">
                  <Info className="w-5 h-5" />
                </div>
                <div className="flex-1 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-bold text-foreground block mb-1">Note</span>
                  {noteContent}
                </div>
              </div>
            </div>
          </div>
        );
      }
      
      if (text.startsWith(':::warning')) {
        const warningContent = text.replace(/^:::warning\s*/, '').replace(/:::$/, '');
        return (
          <div className="my-6 rounded overflow-hidden border-l-4 border-yellow-500 bg-yellow-500/5 dark:bg-yellow-500/10">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="flex-1 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-bold text-foreground block mb-1">Warning</span>
                  {warningContent}
                </div>
              </div>
            </div>
          </div>
        );
      }
      
      // Regular paragraph
      return <p {...props} className="mb-4 leading-7 text-foreground/80">{children}</p>;
    }
  }}
>
  {preprocessContent(preamble.body)}
</ReactMarkdown>
            </div>
          </div>
            <ACPSideRail
              meta={<MetaCard acp={acp} rows={preamble.rows} githubUrl={githubUrl} />}
              tocItems={tocItems}
              activeTocId={activeTocId}
              onActivate={setActiveTocId}
            />
          </div>
      </div>
    </div>
  );
}

function ACPSideRail({
  meta,
  tocItems,
  activeTocId,
  onActivate,
}: {
  meta: React.ReactNode;
  tocItems: TocItem[];
  activeTocId: string;
  onActivate: (id: string) => void;
}) {
  return (
    <aside className="hidden lg:block w-72 shrink-0 self-start sticky top-20">
      <div className="max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 -mr-1">
        {meta}
        {tocItems.length > 0 && (
        <>
        <div className="mt-6 flex items-center gap-2 text-[13px] font-medium text-foreground mb-3">
          <List className="w-3.5 h-3.5 text-muted-foreground" />
          On this page
        </div>
        <ul className="relative border-l border-border">
          {tocItems.map(({ id, title, level }) => {
            const active = id === activeTocId;
            return (
              <li key={id} className="relative">
                <a
                  href={`#${id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    onActivate(id);
                    const el = document.getElementById(id);
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      history.replaceState(null, '', `#${id}`);
                    }
                  }}
                  className={`block py-1.5 text-[12px] transition-colors leading-snug ${
                    level === 3 ? 'pl-7' : 'pl-4'
                  } ${
                    active
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {title}
                </a>
                {active && (
                  <span className="absolute left-[-1px] top-1.5 bottom-1.5 w-0.5 bg-foreground" />
                )}
              </li>
            );
          })}
        </ul>

        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="mt-6 flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowUpCircle className="w-3.5 h-3.5" />
          Back to top
        </button>
        </>
        )}
      </div>
    </aside>
  );
}

// Preamble rows the header and card already cover.
const SHOWN_KEYS = new Set(['acp', 'title', 'author(s)', 'authors', 'author', 'status', 'track']);

/** The proposal's facts in one card: status, track, area, links and any preamble rows like Replaces. */
function MetaCard({ acp, rows, githubUrl }: { acp: EnhancedACP; rows: [string, string][]; githubUrl: string }) {
  const extra = rows.filter(([k]) => !SHOWN_KEYS.has(k.toLowerCase()));
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 py-2 border-t border-border first:border-t-0 text-[12px]">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground text-right min-w-0 break-words">{children}</dd>
    </div>
  );
  return (
    <section className="rounded-md border border-border bg-card px-4 py-2">
      <dl>
        <Row label="Status"><AcpStatusChip status={acp.status} /></Row>
        {acp.track && <Row label="Track">{acp.track.replace(/ Track$/, '')}</Row>}
        {acp.category && <Row label="Area">{acp.category}</Row>}
        {acp.complexity && (
          <Row label="Complexity">
            <span className="inline-flex items-center gap-2">
              <ComplexityDots level={acp.complexity} />
              {acp.complexity}
            </span>
          </Row>
        )}
        {acp.created && <Row label="Created">{new Date(acp.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Row>}
        {extra.map(([k, v]) => (
          <Row key={k} label={k}>
            <ReactMarkdown components={{ p: ({ children }) => <>{children}</>, a: ({ href, children }) => <MdLink href={href}>{children}</MdLink> }}>{v}</ReactMarkdown>
          </Row>
        ))}
        {acp.discussion && (
          <Row label="Discussion">
            <a href={acp.discussion} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground">
              GitHub discussion
            </a>
          </Row>
        )}
        <Row label="Source">
          <a href={githubUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 decoration-foreground/30 hover:decoration-foreground">
            README on GitHub
          </a>
        </Row>
      </dl>
    </section>
  );
}
