// src/services/acpService.ts
import { EnhancedACP, ACPStats } from '../types';

export const acpService = {
  /**
   * Load all ACPs from the processed JSON file
   */
  async loadACPs(): Promise<EnhancedACP[]> {
    try {
      const response = await fetch('/acps/processed-acps.json');
      if (!response.ok) {
        throw new Error(`Failed to load ACPs: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Validate the data structure
      if (!data.acps || !Array.isArray(data.acps)) {
        console.warn('Invalid ACP data structure, returning empty array');
        return [];
      }
      
      // Process each ACP to ensure all required fields exist
      const processedAcps = data.acps.map((acp: any) => ({
        ...acp,
        // Ensure required fields have defaults
        abstract: acp.abstract || 'No abstract available.',
        authors: acp.authors || [],
        tags: acp.tags || [],
        readingTime: acp.readingTime || Math.ceil((acp.wordCount || 1000) / 200),
        complexity: acp.complexity || 'Medium',
        impact: acp.impact || 'Medium',
        category: acp.category || 'Other',
        wordCount: acp.wordCount || 0,
        codeBlockCount: acp.codeBlockCount || 0,
        tableCount: acp.tableCount || 0,
        imageCount: acp.imageCount || 0,
        externalLinks: acp.externalLinks || [],
        discussions: acp.discussions || [],
        requires: acp.requires || [],
        replaces: acp.replaces || [],
        implementationStatus: acp.implementationStatus || 'not-started',
      }));
      
      console.log(`Loaded ${processedAcps.length} ACPs successfully`);
      return processedAcps;
    } catch (error) {
      console.error('Error loading ACPs:', error);
      // Return empty array instead of throwing to prevent app crash
      return [];
    }
  },

  /**
   * Load ACP statistics
   */
  async loadACPStats(): Promise<ACPStats | null> {
    try {
      const response = await fetch('/acps/processed-acps.json');
      if (!response.ok) {
        throw new Error(`Failed to load ACP stats: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.stats) {
        console.warn('No stats found in ACP data');
        return null;
      }
      
      return data.stats;
    } catch (error) {
      console.error('Error loading ACP stats:', error);
      return null;
    }
  },

  /**
   * Load a single ACP by number
   */
  async loadACPByNumber(number: string): Promise<EnhancedACP | null> {
    try {
      const acps = await this.loadACPs();
      const acp = acps.find(a => a.number === number);
      
      if (!acp) {
        console.warn(`ACP-${number} not found`);
        return null;
      }
      
      return acp;
    } catch (error) {
      console.error(`Error loading ACP-${number}:`, error);
      return null;
    }
  },

  

  /**
   * Search ACPs with filters
   */
  async searchACPs(
    query: string,
    filters?: Partial<{
      status: string;
      track: string;
      complexity: string;
      category: string;
      impact: string;
      author: string;
      hasImplementation: boolean;
    }>
  ): Promise<EnhancedACP[]> {
    try {
      const acps = await this.loadACPs();
      
      return acps.filter(acp => {
        // Text search
        if (query) {
          const searchLower = query.toLowerCase();
          const matchesText = 
            acp.title.toLowerCase().includes(searchLower) ||
            acp.number.includes(query) ||
            acp.abstract.toLowerCase().includes(searchLower) ||
            acp.tags?.some(tag => tag.toLowerCase().includes(searchLower)) ||
            acp.authors.some(author => 
              author.name.toLowerCase().includes(searchLower) ||
              author.github.toLowerCase().includes(searchLower)
            );
          
          if (!matchesText) return false;
        }
        
        // Apply filters
        if (filters) {
          if (filters.status && acp.status !== filters.status) return false;
          if (filters.track && acp.track !== filters.track) return false;
          if (filters.complexity && acp.complexity !== filters.complexity) return false;
          if (filters.category && acp.category !== filters.category) return false;
          if (filters.impact && acp.impact !== filters.impact) return false;
          
          if (filters.author) {
            const authorLower = filters.author.toLowerCase();
            const hasAuthor = acp.authors.some(author => 
              author.name.toLowerCase().includes(authorLower) ||
              author.github.toLowerCase().includes(authorLower)
            );
            if (!hasAuthor) return false;
          }
          
          
          
          if (filters.hasImplementation !== null && filters.hasImplementation !== undefined) {
            const hasImplementation = 
              acp.implementationStatus !== 'not-started' || 
              !!acp.implementationUrl ||
              !!acp.referenceImplementation;
            if (filters.hasImplementation !== hasImplementation) return false;
          }
        }
        
        return true;
      });
    } catch (error) {
      console.error('Error searching ACPs:', error);
      return [];
    }
  },

  /**
   * Get related ACPs
   */
  async getRelatedACPs(acpNumber: string): Promise<EnhancedACP[]> {
    try {
      const acps = await this.loadACPs();
      const currentAcp = acps.find(a => a.number === acpNumber);
      
      if (!currentAcp) return [];
      
      const relatedNumbers = new Set<string>();
      
      // Add requires
      currentAcp.requires?.forEach(num => relatedNumbers.add(num));
      
      // Add replaces
      currentAcp.replaces?.forEach(num => relatedNumbers.add(num));
      
      // Add replaced by
      if (currentAcp.replacedBy) relatedNumbers.add(currentAcp.replacedBy);
      
      // Add ACPs that require this one
      acps.forEach(acp => {
        if (acp.requires?.includes(acpNumber)) {
          relatedNumbers.add(acp.number);
        }
      });
      
      // Filter and return related ACPs
      return acps.filter(acp => relatedNumbers.has(acp.number));
    } catch (error) {
      console.error('Error getting related ACPs:', error);
      return [];
    }
  },

  /**
   * Get ACPs by status
   */
  async getACPsByStatus(status: string): Promise<EnhancedACP[]> {
    const acps = await this.loadACPs();
    return acps.filter(acp => acp.status === status);
  },

  /**
   * Get recently updated ACPs
   */
  async getRecentlyUpdatedACPs(days: number = 30): Promise<EnhancedACP[]> {
    const acps = await this.loadACPs();
    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return acps
      .filter(acp => {
        if (!acp.updated) return false;
        return new Date(acp.updated).getTime() > cutoffDate;
      })
      .sort((a, b) => {
        const dateA = new Date(a.updated || 0).getTime();
        const dateB = new Date(b.updated || 0).getTime();
        return dateB - dateA;
      });
  },
};