// src/pages/ACPDetails.tsx
import mermaid from 'mermaid';
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useTheme } from '../hooks/useTheme';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
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
  BookOpen
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
    
    // Initialize mermaid with dynamic theme
    React.useEffect(() => {
      const mermaidTheme = isDark ? 'dark' : 'default';
      const themeVariables = isDark ? getDarkThemeVariables() : getLightThemeVariables();

      mermaid.initialize({
        startOnLoad: false,
        theme: mermaidTheme,
        securityLevel: 'loose',
        themeVariables,
        // Additional config for better rendering
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
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
      const chartId = `mermaid-chart-${Math.random().toString(36).substr(2, 9)}`;
      
      // Validate and clean mermaid content
      const validateAndCleanMermaidContent = (content: string): string => {
        let cleanContent = content.trim();
        
        // Remove any problematic characters that might cause rendering issues
        cleanContent = cleanContent
          .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
          .replace(/\r\n/g, '\n') // Normalize line endings
          .replace(/\r/g, '\n'); // Convert old Mac line endings
        
        // Check for common mermaid syntax issues and fix them
        const lines = cleanContent.split('\n');
        const cleanedLines = lines.map(line => {
          // Fix edge labels with problematic characters
          if (line.includes('-->') || line.includes('-.->') || line.includes('==>')) {
            // Ensure edge labels are properly quoted if they contain special characters
            return line.replace(/-->\s*\|([^|]*)\|/g, (match, label) => {
              const cleanLabel = label.trim().replace(/[^\w\s.-]/g, '');
              return `--> |"${cleanLabel}"|`;
            });
          }
          return line;
        });
        
        return cleanedLines.join('\n');
      };

      React.useEffect(() => {
        const renderChart = async () => {
          try {
            const element = document.getElementById(chartId);
            if (element) {
              // Clear previous content and show loading
              element.innerHTML = `<div class="${isDark ? 'text-gray-400' : 'text-gray-600'} flex justify-center items-center min-h-[200px]">
                <div class="flex items-center space-x-2">
                  <div class="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
                  <span>Rendering diagram...</span>
                </div>
              </div>`;
              
              // Validate and clean content
              const cleanContent = validateAndCleanMermaidContent(content);
              
              // Re-initialize with current theme and improved config
              const mermaidTheme = isDark ? 'dark' : 'default';
              const themeVariables = isDark ? getDarkThemeVariables() : getLightThemeVariables();

              await mermaid.initialize({
                startOnLoad: false,
                theme: mermaidTheme,
                securityLevel: 'loose',
                themeVariables,
                maxTextSize: 90000,
                maxEdges: 200,
                flowchart: {
                  useMaxWidth: true,
                  htmlLabels: false, // Disable HTML labels to avoid positioning issues
                  curve: 'cardinal', // Use smoother curves
                  padding: 20
                },
                sequence: {
                  useMaxWidth: true,
                  showSequenceNumbers: false,
                  actorMargin: 50,
                  boxMargin: 10,
                  boxTextMargin: 5,
                  noteMargin: 10,
                  messageMargin: 35
                },
                gantt: {
                  useMaxWidth: true,
                  leftPadding: 75,
                  gridLineStartPadding: 35
                },
                journey: {
                  useMaxWidth: true
                }
              });
              
              // Try to render with timeout protection
              const renderTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Rendering timeout')), 10000)
              );
              
              const renderPromise = mermaid.render(`${chartId}-svg`, cleanContent);
              
              const { svg } = await Promise.race([renderPromise, renderTimeout]);
              element.innerHTML = svg;
            }
          } catch (error) {
            console.error('Mermaid rendering error:', error);
            const element = document.getElementById(chartId);
            if (element) {
              // Provide more helpful error messages
              let errorMessage = 'Failed to render diagram';
              if (error.message.includes('suitable point')) {
                errorMessage = 'Diagram layout error - try simplifying the diagram structure';
              } else if (error.message.includes('Parse error')) {
                errorMessage = 'Diagram syntax error - please check the diagram code';
              } else if (error.message.includes('timeout')) {
                errorMessage = 'Diagram too complex - rendering timed out';
              }
              
              element.innerHTML = `
                <div class="border-2 border-dashed ${isDark ? 'border-red-800 bg-red-900/20 text-red-400' : 'border-red-300 bg-red-50 text-red-600'} rounded-lg p-4">
                  <div class="flex items-center space-x-2 mb-2">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>
                    <strong>Diagram Error</strong>
                  </div>
                  <p class="text-sm">${errorMessage}</p>
                  <details class="mt-2">
                    <summary class="cursor-pointer text-xs opacity-75 hover:opacity-100">Show raw diagram code</summary>
                    <pre class="mt-2 text-xs ${isDark ? 'bg-gray-800' : 'bg-gray-100'} p-2 rounded overflow-auto">${content}</pre>
                  </details>
                </div>
              `;
            }
          }
        };
        
        if (document.getElementById(chartId)) {
          renderChart();
        }
      }, [chartId, content, isDark]);

      // Listen for theme changes and re-render
      React.useEffect(() => {
        const handleThemeChange = (event: any) => {
          const newTheme = event.detail?.theme || theme;
          const element = document.getElementById(chartId);
          if (element) {
            setTimeout(async () => {
              try {
                element.innerHTML = `<div class="${newTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'} flex justify-center items-center min-h-[200px]">
                  <div class="flex items-center space-x-2">
                    <div class="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
                    <span>Re-rendering diagram...</span>
                  </div>
                </div>`;
                
                const cleanContent = validateAndCleanMermaidContent(content);
                const mermaidTheme = newTheme === 'dark' ? 'dark' : 'default';
                const themeVariables = newTheme === 'dark' ? getDarkThemeVariables() : getLightThemeVariables();

                await mermaid.initialize({
                  startOnLoad: false,
                  theme: mermaidTheme,
                  securityLevel: 'loose',
                  themeVariables,
                  maxTextSize: 90000,
                  maxEdges: 200,
                  flowchart: {
                    useMaxWidth: true,
                    htmlLabels: false,
                    curve: 'cardinal',
                    padding: 20
                  },
                  sequence: {
                    useMaxWidth: true,
                    showSequenceNumbers: false,
                    actorMargin: 50,
                    boxMargin: 10,
                    boxTextMargin: 5,
                    noteMargin: 10,
                    messageMargin: 35
                  }
                });
                
                // Add timeout protection for theme change re-render too
                const renderTimeout = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Re-render timeout')), 8000)
                );
                
                const renderPromise = mermaid.render(`${chartId}-svg-${Date.now()}`, cleanContent);
                const { svg } = await Promise.race([renderPromise, renderTimeout]);
                element.innerHTML = svg;
              } catch (error) {
                console.error('Error re-rendering mermaid on theme change:', error);
                const element = document.getElementById(chartId);
                if (element) {
                  element.innerHTML = `
                    <div class="border-2 border-dashed ${newTheme === 'dark' ? 'border-yellow-800 bg-yellow-900/20 text-yellow-400' : 'border-yellow-300 bg-yellow-50 text-yellow-600'} rounded-lg p-4">
                      <div class="flex items-center space-x-2 mb-2">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                        </svg>
                        <strong>Theme Change Error</strong>
                      </div>
                      <p class="text-sm">Diagram failed to re-render with new theme. Refresh the page to try again.</p>
                    </div>
                  `;
                }
              }
            }, 150);
          }
        };

        window.addEventListener('themeChanged', handleThemeChange);
        return () => window.removeEventListener('themeChanged', handleThemeChange);
      }, [chartId, content, theme]);

      return (
        <div className={`my-8 p-6 rounded-xl overflow-auto transition-all duration-300 border ${
          isDark 
            ? 'bg-dark-800/50 backdrop-blur-sm border-dark-700/50 shadow-xl' 
            : 'bg-white border-gray-200 shadow-lg hover:shadow-xl'
        }`}>
          <div id={chartId} className={`flex justify-center min-h-[200px] items-center transition-colors duration-200 ${
            isDark ? 'text-gray-400' : 'text-gray-600'
          }`}>
            <div className="flex items-center space-x-2">
              <div className={`animate-spin rounded-full h-4 w-4 border-b-2 ${
                isDark ? 'border-[#ef4444]' : 'border-[#ef4444]'
              }`}></div>
              <span>Loading diagram...</span>
            </div>
          </div>
        </div>
      );
    }

    // Regular code blocks with improved styling
    return match ? (
      <div className={`my-4 rounded-lg border overflow-hidden ${
        isDark 
          ? 'bg-dark-800/50 border-dark-700/50' 
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div className={`px-4 py-2 text-xs font-medium border-b ${
          isDark 
            ? 'bg-dark-700/50 border-dark-600/50 text-gray-300' 
            : 'bg-gray-100 border-gray-200 text-gray-600'
        }`}>
          {match[1]}
        </div>
        <pre className={`p-4 overflow-auto text-sm ${
          isDark ? 'text-gray-300' : 'text-gray-800'
        }`}>
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      </div>
    ) : (
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
          <div className="bg-white dark:bg-dark-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-8 p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl font-mono text-[#ef4444] dark:text-[#ef4444] font-bold">
                    ACP-{acp.number}
                  </span>
                  
                </div>

                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                  <ReactMarkdown>{acp.title}</ReactMarkdown>
                </h1>

                {/* Authors */}
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-gray-400" />
                  <div className="flex flex-wrap gap-2">
                    {acp.authors?.map((author, index) => (
                      <a
                        key={index}
                        href={`https://github.com/${author.github}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm text-[#ef4444] hover:text-[#dc2626] dark:text-[#ef4444] dark:hover:text-[#dc2626]"
                      >
                        {author.name}
                        <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    )) || <span className="text-sm text-gray-600 dark:text-gray-400">Unknown</span>}
                  </div>
                </div>

                

                {/* Actions */}
                <div className="flex gap-3 flex-wrap">
                  {acp.discussion && (
                    <a
                      href={acp.discussion}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                    >
                      <LinkIcon className="w-4 h-4 mr-2" />
                      View Discussion
                      <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  )}

                  <a
                    href={`https://github.com/avalanche-foundation/ACPs/tree/main/ACPs/${acp.folderName || acp.number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Github className="w-4 h-4 mr-2" />
                    View on GitHub
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </a>

                  <button
                    onClick={copyToClipboard}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-800 hover:bg-gray-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2 text-green-500" />
                        Copied!
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
    // Handle custom note blocks
    p: ({ children, ...props }) => {
      const text = String(children);
      
      // Check if this paragraph starts with our note syntax
      if (text.startsWith(':::note')) {
        const noteContent = text.replace(/^:::note\s*/, '').replace(/:::$/, '');
        return (
          <div className="my-6 p-4 bg-[#ef4444]/10 dark:bg-[#ef4444]/20 border-l-4 border-[#ef4444] rounded-r-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 text-[#ef4444] mt-0.5">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-[#ef4444] dark:text-[#ef4444] mb-1">Note</div>
                <div className="text-sm text-[#ef4444] dark:text-[#ef4444]">{noteContent}</div>
              </div>
            </div>
          </div>
        );
      }
      
      if (text.startsWith(':::warning')) {
        const warningContent = text.replace(/^:::warning\s*/, '').replace(/:::$/, '');
        return (
          <div className="my-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r-lg">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 text-yellow-500 mt-0.5">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-1">Warning</div>
                <div className="text-sm text-yellow-700 dark:text-yellow-300">{warningContent}</div>
              </div>
            </div>
          </div>
        );
      }
      
      // Regular paragraph
      return <p {...props}>{children}</p>;
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
