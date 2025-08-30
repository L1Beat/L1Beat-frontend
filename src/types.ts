// Chain related types
export interface Chain {
  chainId: string;
  chainName: string;
  chainLogoUri?: string;
  description?: string;
  subnetId?: string;
  platformChainId?: string;
  tps: {
    value: number;
    timestamp: number;
  } | null;
  cumulativeTxCount?: {
    value: number;
    timestamp: number;
  } | null;
  validators: Validator[];
  networkToken?: {
    name: string;
    symbol: string;
    logoUri?: string;
    decimals?: number;
  };
  explorerUrl?: string;
  rpcUrl?: string;
  wsUrl?: string;
}

export interface Validator {
  address: string;
  active: boolean;
  uptime: number;
  weight: number;
  explorerUrl?: string;
}

// TVL related types
export interface TVLHistory {
  date: number;
  tvl: number;
}

export interface TVLHealth {
  lastUpdate: string;
  ageInHours: number;
  tvl: number;
  status: 'healthy' | 'stale';
}

// TPS related types
export interface NetworkTPS {
  totalTps: number;
  chainCount: number;
  timestamp: number;
  lastUpdate: string;
  dataAge: number;
  dataAgeUnit: string;
  updatedAt: string;
}

export interface TPSHistory {
  timestamp: number;
  totalTps: number;
  chainCount: number;
  date: number;
}

// Cumulative Transaction Count types
export interface CumulativeTxCount {
  timestamp: number;
  value: number;
}

export interface CumulativeTxCountResponse {
  success: boolean;
  chainId: string;
  count: number;
  data: CumulativeTxCount[];
}

// Health related types
export interface HealthStatus {
  status: string;
  timestamp: number;
}

// Teleporter message types
export interface TeleporterMessage {
  source: string;
  target: string;
  count: number;
}

export interface TeleporterMessageData {
  messages: TeleporterMessage[];
  metadata: {
    totalMessages: number;
    startDate: string;
    endDate: string;
    updatedAt: string;
  };
}

export interface TeleporterDailyMessage {
  sourceChain: string;
  destinationChain: string;
  messageCount: number;
}

export interface TeleporterDailyData {
  date: string;
  dateString: string;
  data: TeleporterDailyMessage[];
  totalMessages: number;
  timeWindow: number;
}

export type TimeframeOption = 7 | 14 | 30 | 90;

// ============= ACP TYPES =============

// Base Author interface
export interface Author {
  name: string;
  github: string;
  email?: string;
  organization?: string;
}

// Base ACP interface - keep for backward compatibility
export interface ACP {
  number: string;
  title: string;
  authors: Author[];
  status: string;
  track: string;
  content: string;
  discussion?: string;
}

// Enhanced ACP with all metadata - REPLACE YOUR EXISTING EnhancedACP
export interface EnhancedACP extends ACP {
  // Additional metadata fields
  folderName?: string;
  
  // Dates and timeline
  created?: string;
  updated?: string;
  proposed?: string;
  implementable?: string;
  activated?: string;
  stale?: string;
  
  // Content metadata
  abstract: string;
  motivation?: string;
  specification?: string;
  securityConsiderations?: string;
  openQuestions?: string[];
  
  // Relationships
  requires?: string[];
  replaces?: string[];
  replacedBy?: string;
  relatedAcps?: string[];
  dependencies?: string[];  // Alias for requires (backward compatibility)
  supersededBy?: string;     // Alias for replacedBy (backward compatibility)
  
  // Implementation details
  implementationStatus?: string;  // Keep as string for flexibility
  implementationUrl?: string;
  referenceImplementation?: string;
  testnetDeployment?: string;
  mainnetDeployment?: string;
  
  // Categorization - using strings for backward compatibility
  complexity?: string;
  category?: string;
  subcategory?: string;
  tags?: string[];
  impact?: string;
  
  // Metrics
  wordCount?: number;
  readingTime?: number;
  codeBlockCount?: number;
  externalLinks?: ExternalLink[];
  tableCount?: number;
  imageCount?: number;
  
  // Discussion and engagement
  discussions?: Discussion[];
  primaryDiscussion?: string;
  communitySupport?: CommunitySupport;
  
  // Search and indexing
  searchableText?: string;
  keywords?: string[];
}

// Supporting interfaces
export interface ExternalLink {
  url: string;
  type: 'discussion' | 'implementation' | 'documentation' | 'reference' | 'other';
  title?: string;
  platform?: string;
}

export interface Discussion {
  url: string;
  platform: 'github' | 'forum' | 'discord' | 'twitter' | 'other';
  title?: string;
  commentCount?: number;
  lastActivity?: string;
  participants?: number;
}

export interface CommunitySupport {
  supportPercentage?: number;
  votesFor?: number;
  votesAgainst?: number;
  votesAbstain?: number;
  totalVotes?: number;
  quorumReached?: boolean;
}

// Statistics interface
export interface ACPStats {
  total: number;
  byStatus: Record<string, number>;
  byTrack: Record<string, number>;
  byComplexity: Record<string, number>;
  byCategory?: Record<string, number>;
  byImpact?: Record<string, number>;
  averageReadingTime?: number;
  totalAuthors?: number;
  implementationProgress?: {
    notStarted: number;
    inProgress: number;
    completed: number;
    deployed: number;
  };
  recentlyUpdated?: number;
  needsAttention?: number;
}

// Filter interfaces
export interface ACPFilters {
  status: string;
  track: string;
  complexity: string;
  category?: string;
  impact?: string;
  author: string;
  hasDiscussion: boolean | null;
  hasImplementation?: boolean | null;
  dateRange?: {
    start: string;
    end: string;
  };
  search?: string;
}

// View and sorting options
export type ViewMode = 'grid' | 'list' | 'timeline' | 'pipeline';
export type SortOption = 'number' | 'title' | 'status' | 'track' | 'complexity' | 'impact' | 'updated' | 'created';
export type SortOrder = 'asc' | 'desc';

// ACP relationship types
export interface ACPRelationship {
  type: 'depends' | 'replaces' | 'superseded-by';
  acpNumber: string;
  title?: string;
}

// ACP author with validation
export interface ACPAuthor {
  name: string;
  github: string;
  isValidGithub?: boolean;
}

// Enhanced ACP with computed properties
export interface ProcessedACP extends EnhancedACP {
  searchableText: string;
  relationships: ACPRelationship[];
  validatedAuthors: ACPAuthor[];
}

// API response interfaces
export interface ACPListResponse {
  acps: EnhancedACP[];
  stats: ACPStats;
  total: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
}

export interface ACPSearchResponse extends ACPListResponse {
  query: string;
  filters: ACPFilters;
  suggestions?: string[];
}