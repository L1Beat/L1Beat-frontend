import React from 'react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { acpService } from '../services/acpService';
import {
  Users,
  ArrowRight,
  BookOpen,
  MessageCircle,
} from 'lucide-react';

const EnhancedACPCard = ({ acp, viewMode = 'grid', onClick }) => {
  
  const getStatusColor = (status) => {
    const cleanStatus = status?.toLowerCase() || '';
    
    switch (cleanStatus) {
      case 'final':
      case 'active':
      case 'activated':
        return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300';
      case 'draft':
      case 'proposed':
        return 'bg-[#ef4444]/10 text-[#ef4444] dark:bg-[#ef4444]/20 dark:text-[#ef4444]';
      case 'review':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300';
      case 'withdrawn':
      case 'rejected':
      case 'stagnant':
      case 'stale':
        return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300';
      default:
        // Avoid bg-muted/xx opacity: CSS vars are not RGB, can break in dark mode.
        return 'bg-muted text-muted-foreground border border-border';
    }
  };

  const getComplexityIndicator = (complexity) => {
    const levels = {
      'Low': { bars: 1, color: 'bg-green-500' },
      'Medium': { bars: 2, color: 'bg-yellow-500' },
      'High': { bars: 3, color: 'bg-orange-500' },
      'Very High': { bars: 4, color: 'bg-red-500' },
    };
    const config = levels[complexity] || levels['Medium'];

    return (
      <div className="flex items-center gap-1" title={`Complexity: ${complexity}`}>
        <span className="text-xs text-muted-foreground">Complexity:</span>
        <div className="flex gap-0.5 items-center">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className={`h-2 w-1.5 rounded-full ${
                i < config.bars ? config.color : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>
    );
  };

  const MetadataItem = ({ icon: Icon, label, value, colorClass = '' }) => (
    <div className={`flex items-center gap-1.5 text-muted-foreground ${colorClass}`}>
      <Icon className="w-4 h-4" />
      <span className="text-xs font-medium">{label}</span>
      {value && <span className="text-xs font-semibold text-foreground">{value}</span>}
    </div>
  );


  if (viewMode === 'list') {
    return (
      <motion.div
        onClick={() => onClick(acp)}
        className="bg-card rounded-xl border border-border p-4 cursor-pointer group"
        whileHover={{
          boxShadow: "0 10px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04)",
          borderColor: "rgb(239, 68, 68)",
          y: -2
        }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1">
            <div className="flex items-center gap-4 mb-2">
              <span className="text-lg font-bold font-mono text-[#ef4444] dark:text-[#ef4444]">
                ACP-{acp.number}
              </span>
              <motion.h3
                className="text-base font-semibold text-foreground"
                whileHover={{ color: "#ef4444" }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                <ReactMarkdown>{acp.title}</ReactMarkdown>
              </motion.h3>
            </div>
            <div className="text-sm text-muted-foreground line-clamp-2">
              <ReactMarkdown>{acp.abstract}</ReactMarkdown>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-4">
                <MetadataItem icon={Users} label={`${acp.authors?.length || 0} authors`} />
                <MetadataItem icon={BookOpen} label={`${acp.readingTime} min read`} />
                
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStatusColor(acp.status)}`}>
                {acp.status}
                </span>
                {getComplexityIndicator(acp.complexity)}
              </div>
            </div>
            <motion.div
              whileHover={{ x: 4, color: "#ef4444" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <ArrowRight className="w-6 h-6 text-muted-foreground" />
            </motion.div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      onClick={() => onClick(acp)}
      className="bg-card rounded-xl border border-border p-5 cursor-pointer group h-full flex flex-col"
      whileHover={{
        boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04)",
        borderColor: "#ef4444",
        y: -4,
        scale: 1.02
      }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="flex-1">
        <div className="flex items-start justify-between mb-3">
          <span className="text-xl font-bold font-mono text-[#ef4444] dark:text-[#ef4444]">
            ACP-{acp.number}
          </span>
          <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getStatusColor(acp.status)}`}>
          {acp.status}
          </span>
        </div>

        <motion.h3
          className="text-lg font-semibold text-foreground mb-2 leading-tight"
          whileHover={{ color: "#ef4444" }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <ReactMarkdown>{acp.title}</ReactMarkdown>
        </motion.h3>

        <div className="text-sm text-muted-foreground mb-4 line-clamp-4 leading-relaxed">
          <ReactMarkdown>{acp.abstract}</ReactMarkdown>
        </div>
      </div>

      <div className="pt-4 border-t border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium">{acp.authors?.length || 0} authors</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <BookOpen className="w-4 h-4" />
            <span className="text-xs font-medium">{acp.readingTime} min read</span>
          </div>
          
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground border border-border">
              {acp.track}
            </span>
            <span className="px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground border border-border">
              {acp.category}
            </span>
          </div>
          {getComplexityIndicator(acp.complexity)}
        </div>
      </div>
    </motion.div>
  );
};

export default EnhancedACPCard;
