// src/pages/ACPDetails.tsx
import mermaid from 'mermaid';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useTheme } from '../hooks/useTheme';
import 'katex/dist/katex.min.css';
import { StatusBar } from '../components/StatusBar';
import { Footer } from '../components/Footer';
import { LoadingSpinner } from '../components/LoadingSpinner';
import {
  ArrowLeft,
  ExternalLink,
  Users,
  Tag,
  Clock,
  Github,
  Link as LinkIcon,
  Copy,
  Check,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Info
} from 'lucide-react';
import { getHealth } from '../api';
import { HealthStatus } from '../types';
import { acpService, LocalACP } from '../services/acpService';
const preprocessContent = (content: string) => {
  return content
    // Remove metadata table at the start of the document
    // Matches lines starting with | at the very beginning (ignoring leading whitespace) until a line that doesn't start with |
    .replace(/^\s*\| ACP \|[\s\S]*?(?:\n\n|\n(?![|]))/g, '')
    // Only escape very specific, obvious currency tokens - be extremely conservative
    .replace(/\$AVAX(?!\s*[+\-*/=<>≥≤\\{}()^_])/g, '&#36;AVAX')
    .replace(/\$AVAX-([A-Za-z][A-Za-z\-]*)/g, '&#36;AVAX-$1')
    .replace(/\$ETH(?!\s*[+\-*/=<>≥≤\\{}()^_])/g, '&#36;ETH')
    .replace(/\$ETH-([A-Za-z][A-Za-z\-]*)/g, '&#36;ETH-$1')
    .replace(/\n*\[!NOTE\]\s*(.*?)(?=\n\n|\n(?=[A-Z])|$)/gs, (match, noteContent) => {
      return `\n\n:::note\n${noteContent.trim()}\n\n\n`;
    })
    // Convert [WARNING] blocks if they exist
    .replace(/\n*\[!WARNING\]\s*(.*?)(?=\n\n|\n(?=[A-Z])|$)/gs, (match, warningContent) => {
      return `\n\n:::warning\n${warningContent.trim()}\n\n\n`;
    })
    .replace(/<div[^>]*>/g, '')
    .replace(/<\/div>/g, '');
};

export default function ACPDetails() {
  const { acpNumber } = useParams<{ acpNumber: string }>();
  const navigate = useNavigate();
  const [acp, setAcp] = useState<LocalACP | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // Dynamically load syntax highlighter only on client side
  const [SyntaxHighlighter, setSyntaxHighlighter] = useState<any>(null);
  const [syntaxStyles, setSyntaxStyles] = useState<any>({ vscDarkPlus: {}, oneLight: {} });

  useEffect(() => {
    // Only load on client side
    if (typeof window !== 'undefined') {
      Promise.all([
        import('react-syntax-highlighter').then(mod => mod.Prism),
        import('react-syntax-highlighter/dist/esm/styles/prism').then(styles => ({
          vscDarkPlus: styles.vscDarkPlus,
          oneLight: styles.oneLight
        }))
      ]).then(([Highlighter, styles]) => {
        setSyntaxHighlighter(() => Highlighter);
        setSyntaxStyles(styles);
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
        const [acpData, healthData] = await Promise.all([
          acpService.loadACPByNumber(acpNumber),
          getHealth(),
        ]);
        
        if (!mounted) return;
        
        if (!acpData) {
          setError(`ACP-${acpNumber} not found`);
          return;
        }

        setAcp(acpData);
        setHealth(healthData);
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
    
    // Improved theme variables that match your app's design system
    const getDarkThemeVariables = () => ({
      // Primary elements - nice blue that matches your app
      primaryColor: '#3b82f6',
      primaryTextColor: '#e2e8f0',  // Light gray for better readability
      primaryBorderColor: '#1e40af',
      
      // Lines and connections
      lineColor: '#64748b',         // Neutral gray for lines
      
      // Background colors using your dark palette
      background: '#0f172a',        // dark-900
      mainBkg: '#1e293b',          // dark-800  
      secondBkg: '#334155',        // dark-700
      tertiaryColor: '#475569',    // dark-600
      
      // Secondary elements
      secondaryColor: '#334155',    // dark-700
      
      // Additional colors for better contrast
      cScale0: '#0f172a',          // dark-900
      cScale1: '#1e293b',          // dark-800
      cScale2: '#334155',          // dark-700
      cScale3: '#475569',          // dark-600
      cScale4: '#64748b',          // dark-500
      
      // Text colors with good contrast
      cScale11: '#e2e8f0',         // Light text
      cScale12: '#f1f5f9',         // Lighter text
      
      // Node specific colors
      nodeBkg: '#1e293b',          // dark-800
      nodeTextColor: '#e2e8f0',    // Light gray
      nodeBorder: '#3b82f6',       // Blue border
      
      // Special element colors
      clusterBkg: '#334155',       // dark-700
      clusterBorder: '#64748b',    // dark-500
      defaultLinkColor: '#64748b', // dark-500
      
      // Error and success states
      errorBkgColor: '#ef4444',
      errorTextColor: '#fecaca',
      successBkgColor: '#10b981',
      successTextColor: '#a7f3d0',
    });

    const getLightThemeVariables = () => ({
      // Primary elements - matching blue
      primaryColor: '#3b82f6',
      primaryTextColor: '#1e293b',  // Dark text for contrast
      primaryBorderColor: '#1e40af',
      
      // Lines and connections  
      lineColor: '#64748b',         // Neutral gray
      
      // Light backgrounds
      background: '#ffffff',
      mainBkg: '#ffffff',
      secondBkg: '#f8fafc',        // Very light gray
      tertiaryColor: '#e2e8f0',    // Light gray
      
      // Secondary elements
      secondaryColor: '#f1f5f9',   // Light gray
      
      // Scale colors for light mode
      cScale0: '#ffffff',
      cScale1: '#f8fafc',
      cScale2: '#f1f5f9',
      cScale3: '#e2e8f0',
      cScale4: '#cbd5e1',
      
      // Dark text for contrast
      cScale11: '#334155',
      cScale12: '#1e293b',
      
      // Node colors for light mode
      nodeBkg: '#ffffff',
      nodeTextColor: '#1e293b',
      nodeBorder: '#3b82f6',
      
      // Special elements
      clusterBkg: '#f8fafc',
      clusterBorder: '#cbd5e1',
      defaultLinkColor: '#64748b',
      
      // States
      errorBkgColor: '#ef4444',
      errorTextColor: '#991b1b',
      successBkgColor: '#10b981',
      successTextColor: '#065f46',
    });
    
    // Initialize mermaid with dynamic theme for high contrast
    React.useEffect(() => {
      const themeVariables = isDark ? {
        // Dark mode - Force high contrast node colors
        primaryColor: '#1e293b', // dark-800
        primaryTextColor: '#ffffff', 
        primaryBorderColor: '#94a3b8', // light gray border
        lineColor: '#e2e8f0', // light lines
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
        theme: 'base', // Use base theme to apply our custom variables strictly
        securityLevel: 'loose',
        fontFamily: 'Inter, system-ui, sans-serif',
        themeVariables,
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'basis'
        },
        sequence: {
          useMaxWidth: true,
        }
      });
    }, [isDark]);

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
                const { svg } = await mermaid.render(uniqueId, cleanContent);
                element.innerHTML = svg;
              } catch (renderError) {
                console.error('Mermaid render failed:', renderError);
                element.innerHTML = `
                  <div class="border-2 border-dashed border-red-500/20 bg-red-500/10 text-red-600 rounded-lg p-4">
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
        <div className="my-8 p-4 rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-colors duration-200">
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
        <div className="my-6 rounded-xl overflow-hidden border border-border bg-card shadow-sm transition-colors duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]" />
              </div>
              <span className="ml-2 text-xs font-medium font-mono text-muted-foreground">
                {match[1]}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md transition-all duration-200 text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
              title="Copy code"
            >
              {isCopied ? (
                <Check className="w-4 h-4 text-green-500" />
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
              <pre className="p-6 overflow-x-auto bg-muted rounded-b-lg">
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

  const getCleanStatus = (status: string) => {
    if (!status) return 'Unknown';
    const match = status.match(/^[a-zA-Z]+/);
    return match ? match[0] : 'Unknown';
  };

  const getStatusIcon = (status: string) => {
      const cleanStatus = getCleanStatus(status); // Add this line
      switch (cleanStatus?.toLowerCase()) {
      case 'activated':
      case 'final':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'draft':
      case 'review':
        return <Clock className="w-5 h-5 text-yellow-500" />;
      case 'stagnant':
      case 'withdrawn':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
      const cleanStatus = getCleanStatus(status);
    switch (cleanStatus?.toLowerCase()) {
      case 'activated':
      case 'final':
        return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-500/20 dark:text-green-400 dark:border-green-500/30';
      case 'draft':
        return 'bg-[#ef4444]/10 text-[#ef4444] border-[#ef4444]/20 dark:bg-[#ef4444]/20 dark:text-[#ef4444] dark:border-[#ef4444]/30';
      case 'review':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/30';
      case 'stagnant':
      case 'withdrawn':
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border border';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <StatusBar health={health} />
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
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <StatusBar health={health} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-red-600" />
            <h2 className="text-lg font-semibold text-foreground mb-2">
              ACP Not Found
            </h2>
            <p className="text-muted-foreground mb-4">
              {error || `ACP-${acpNumber} could not be found.`}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/acps')}
                className="inline-flex items-center px-4 py-2 border border-border rounded-md shadow-sm text-sm font-medium text-foreground bg-muted hover:bg-accent hover:border-[#ef4444]/20 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to ACPs
              </button>
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#ef4444] hover:bg-[#dc2626]"
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

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <StatusBar health={health} />

      <div className="flex-1">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => navigate('/acps')}
              className="inline-flex items-center px-4 py-2 border border-border shadow-sm text-sm font-medium rounded-lg text-muted-foreground bg-card hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ef4444] transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to ACPs
            </button>
          </div>

          {/* ACP Header */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_60px_-30px_rgba(239,68,68,0.35)] mb-8">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#ef4444]/15 blur-3xl" />
              <div className="absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-[#ef4444]/10 blur-3xl" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/5 dark:to-white/5" />
            </div>

            <div className="relative p-8">
              <div className="flex flex-col gap-6">
                {/* Top Row: ID and Status */}
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-mono font-bold text-[#ef4444]">
                      ACP-{acp.number}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-2 ${getStatusColor(acp.status)}`}>
                      {getStatusIcon(acp.status)}
                      {acp.status}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                      {acp.track} Track
                    </span>
                    {acp.complexity && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
                        {acp.complexity} Complexity
                      </span>
                    )}
                  </div>
                </div>

                <h1 className="text-4xl font-semibold tracking-tight text-foreground leading-tight">
                  <ReactMarkdown>{acp.title}</ReactMarkdown>
                </h1>

                {/* Author and Meta */}
                <div className="flex flex-wrap items-center gap-6 text-sm border-y border-border py-6">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-muted-foreground" />
                    <div className="flex flex-wrap items-center gap-2">
                      {acp.authors?.map((author, index) => (
                        <React.Fragment key={index}>
                          {index > 0 && <span className="text-muted-foreground">|</span>}
                          <a
                            href={author.url || `https://github.com/${author.github}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-foreground hover:text-[#ef4444] transition-colors"
                          >
                            {author.name}
                          </a>
                        </React.Fragment>
                      )) || <span className="text-muted-foreground">Unknown</span>}
                    </div>
                  </div>

                  {acp.created && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      <span>Created {new Date(acp.created).toLocaleDateString()}</span>
                    </div>
                  )}

                  {acp.updated && (
                    <>
                      <div className="w-px h-4 bg-border hidden sm:block" />
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <RefreshCw className="w-4 h-4" />
                        <span>Last updated {new Date(acp.updated).toLocaleDateString()}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={() => window.open(githubUrl, '_blank', 'noopener,noreferrer')}
                    className="inline-flex items-center px-5 py-2.5 rounded-lg shadow-sm text-sm font-medium text-white bg-[#ef4444] hover:bg-[#dc2626] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#ef4444] transition-all cursor-pointer"
                  >
                    <Github className="w-4 h-4 mr-2" />
                    View on GitHub
                  </button>

                  {acp.discussion && (
                    <button
                      onClick={() => window.open(acp.discussion, '_blank', 'noopener,noreferrer')}
                      className="inline-flex items-center px-5 py-2.5 border border-border rounded-lg shadow-sm text-sm font-medium text-foreground bg-muted hover:bg-accent hover:border-[#ef4444]/20 transition-all cursor-pointer"
                    >
                      <LinkIcon className="w-4 h-4 mr-2" />
                      View Discussion
                    </button>
                  )}

                  <button
                    onClick={copyToClipboard}
                    className="inline-flex items-center px-5 py-2.5 border border-border rounded-lg shadow-sm text-sm font-medium text-foreground bg-muted hover:bg-accent hover:border-[#ef4444]/20 transition-all ml-auto"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2 text-green-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Content with ReactMarkdown */}
          <div className="bg-card rounded-2xl shadow-sm border border-border p-8 overflow-hidden">
            <div className="max-w-none break-words">
            <ReactMarkdown 
  remarkPlugins={[remarkGfm, remarkMath]}
  rehypePlugins={[rehypeKatex]}
  components={{
    code: CodeBlock,
    a: ({ children, ...props }) => (
      <a
        {...props}
        className="text-[#ef4444] hover:text-[#dc2626] underline underline-offset-4 decoration-[#ef4444]/30"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    h1: ({ children, ...props }) => (
      <h1 {...props} className="mt-10 mb-4 text-3xl font-semibold tracking-tight text-foreground">
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 {...props} className="mt-10 mb-4 text-2xl font-semibold tracking-tight text-foreground">
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 {...props} className="mt-8 mb-3 text-xl font-semibold text-foreground">
        {children}
      </h3>
    ),
    h4: ({ children, ...props }) => (
      <h4 {...props} className="mt-6 mb-3 text-lg font-semibold text-foreground">
        {children}
      </h4>
    ),
    ul: ({ children, ...props }) => (
      <ul {...props} className="my-4 ml-6 list-disc space-y-2 text-muted-foreground">
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol {...props} className="my-4 ml-6 list-decimal space-y-2 text-muted-foreground">
        {children}
      </ol>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        {...props}
        className="my-6 rounded-r-lg border-l-4 border-[#ef4444]/30 bg-[#ef4444]/5 px-4 py-3 text-muted-foreground"
      >
        {children}
      </blockquote>
    ),
    table: ({ children, ...props }) => (
      <div className="my-6 overflow-x-auto">
        <table {...props} className="min-w-full border-collapse text-sm">
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
          className="max-w-full h-auto rounded-lg shadow-md my-8 border border-border block mx-auto bg-card"
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
          <div className="my-6 rounded-lg overflow-hidden border-l-4 border-[#ef4444] bg-[#ef4444]/5 dark:bg-[#ef4444]/10">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-5 h-5 text-[#ef4444] mt-0.5">
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
          <div className="my-6 rounded-lg overflow-hidden border-l-4 border-yellow-500 bg-yellow-500/5 dark:bg-yellow-500/10">
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
      return <p {...props} className="mb-4 leading-relaxed text-muted-foreground">{children}</p>;
    }
  }}
>
  {preprocessContent(acp.content)}
</ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
