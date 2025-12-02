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
              element.innerHTML = `<div class="flex justify-center items-center min-h-[200px] ${isDark ? 'text-gray-400' : 'text-gray-500'}">
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
                  <div class="border-2 border-dashed border-red-300 bg-red-50 text-red-600 rounded-lg p-4">
                    <p class="font-medium mb-2">Failed to render diagram</p>
                    <pre class="text-xs bg-white p-2 rounded overflow-auto border border-red-100">${cleanContent}</pre>
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
        <div className={`my-8 p-4 rounded-xl border shadow-sm overflow-hidden transition-colors duration-200 ${
          isDark 
            ? 'bg-dark-800 border-dark-700' 
            : 'bg-white border-gray-200'
        }`}>
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
        <div className={`my-6 rounded-xl overflow-hidden border transition-colors duration-200 ${
          isDark 
            ? 'bg-[#1e1e1e] border-dark-700 shadow-lg' 
            : 'bg-white border-gray-200 shadow-md'
        }`}>
          <div className={`flex items-center justify-between px-4 py-3 border-b ${
            isDark 
              ? 'bg-dark-800 border-dark-700' 
              : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]" />
              </div>
              <span className={`ml-2 text-xs font-medium font-mono ${
                isDark ? 'text-gray-400' : 'text-gray-500'
              }`}>
                {match[1]}
              </span>
            </div>
            <button
              onClick={handleCopy}
              className={`p-1.5 rounded-md transition-all duration-200 ${
                isDark 
                  ? 'text-gray-400 hover:bg-dark-700 hover:text-white' 
                  : 'text-gray-500 hover:bg-gray-200 hover:text-gray-900'
              }`}
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
              <pre className="p-6 overflow-x-auto bg-gray-900 dark:bg-gray-800 rounded-b-lg">
                <code className="text-gray-300 text-sm font-mono">{content}</code>
              </pre>
            )}
          </div>
        </div>
      );
    }

    return (
      <code className={`px-1.5 py-0.5 rounded text-sm font-mono ${
        isDark 
          ? 'bg-dark-700/50 text-gray-300' 
          : 'bg-gray-100 text-gray-800'
      }`} {...props}>
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
        return <AlertTriangle className="w-5 h-5 text-gray-500" />;
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
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-500/20 dark:text-gray-400 dark:border-gray-500/30';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex flex-col">
        <StatusBar health={health} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mt-4 mb-2">
              Loading ACP-{acpNumber}...
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Fetching proposal details from local data.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !acp) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex flex-col">
        <StatusBar health={health} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-8 h-8 mx-auto mb-4 text-red-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              ACP Not Found
            </h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              {error || `ACP-${acpNumber} could not be found.`}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => navigate('/acps')}
                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700"
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
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex flex-col">
      <StatusBar health={health} />

      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => navigate('/acps')}
              className="inline-flex items-center text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to ACPs
            </button>
          </div>

          {/* ACP Header */}
          <div className="bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 mb-8 overflow-hidden">
            <div className="p-8">
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
                    <span className={`px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-gray-300`}>
                      {acp.track} Track
                    </span>
                    {acp.complexity && (
                      <span className={`px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-gray-300`}>
                        {acp.complexity} Complexity
                      </span>
                    )}
                  </div>
                </div>

                <h1 className="text-4xl font-bold text-gray-900 dark:text-white leading-tight">
                  <ReactMarkdown>{acp.title}</ReactMarkdown>
                </h1>

                {/* Author and Meta */}
                <div className="flex flex-wrap items-center gap-6 text-sm border-y border-gray-100 dark:border-gray-700 py-6">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-gray-400" />
                    <div className="flex flex-wrap gap-2">
                      {acp.authors?.map((author, index) => (
                        <a
                          key={index}
                          href={`https://github.com/${author.github}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-gray-900 dark:text-white hover:text-[#ef4444] dark:hover:text-[#ef4444] transition-colors"
                        >
                          @{author.name}
                        </a>
                      )) || <span className="text-gray-500">Unknown</span>}
                    </div>
                  </div>

                  <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 hidden sm:block" />

                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <Clock className="w-4 h-4" />
                    <span>Created {new Date(acp.created).toLocaleDateString()}</span>
                  </div>

                  {acp.updated && (
                    <>
                      <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 hidden sm:block" />
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
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
                    <a
                      href={acp.discussion}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => handleLinkClick(e, acp.discussion!)}
                      className="inline-flex items-center px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700 transition-all"
                    >
                      <LinkIcon className="w-4 h-4 mr-2" />
                      Discussion
                    </a>
                  )}

                  <button
                    onClick={copyToClipboard}
                    className="inline-flex items-center px-5 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700 transition-all ml-auto"
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
          <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-8 overflow-hidden">
            <div className="prose prose-gray dark:prose-invert max-w-none break-words prose-table:table-auto prose-table:border-collapse prose-th:border prose-th:border-gray-300 prose-th:px-4 prose-th:py-2 prose-th:bg-gray-50 prose-td:border prose-td:border-gray-300 prose-td:px-4 prose-td:py-2">
            <ReactMarkdown 
  remarkPlugins={[remarkGfm, remarkMath]}
  rehypePlugins={[rehypeKatex]}
  components={{
    code: CodeBlock,
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
          className="max-w-full h-auto rounded-lg shadow-md my-8 border border-gray-200 dark:border-gray-700 block mx-auto dark:bg-white dark:p-2"
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
                <div className="flex-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  <span className="font-bold text-gray-900 dark:text-white block mb-1">Note</span>
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
                <div className="flex-1 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  <span className="font-bold text-gray-900 dark:text-white block mb-1">Warning</span>
                  {warningContent}
                </div>
              </div>
            </div>
          </div>
        );
      }
      
      // Regular paragraph
      return <p {...props} className="mb-4 leading-relaxed text-gray-800 dark:text-gray-300">{children}</p>;
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
