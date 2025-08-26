#!/usr/bin/env node

// Enhanced ACP Build Script - scripts/build-acps.js
// Processes ACP markdown files with comprehensive metadata extraction

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync, spawnSync } from "child_process";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ACPS_DIR = path.join(__dirname, "../public/acps/ACPs");
const OUTPUT_DIR = path.join(__dirname, "../public/acps");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "processed-acps.json");

class EnhancedACPBuilder {
  constructor() {
    this.acps = [];
    this.stats = {
      total: 0,
      byStatus: {},
      byTrack: {},
      byComplexity: {},
      byCategory: {},
      byImpact: {},
      averageReadingTime: 0,
      totalAuthors: new Set(),
      implementationProgress: {
        notStarted: 0,
        inProgress: 0,
        completed: 0,
        deployed: 0,
      },
      recentlyUpdated: 0,
      needsAttention: 0,
    };
  }

  getCleanStatus(status) {
    if (!status) return "Unknown";

    // Extracts the primary status from a detailed string.
    // e.g., "Proposed (Discussion)" -> "Proposed"
    // e.g., "Active [ACPs.md]" -> "Active"
    // e.g., "Proposed (Last Call - Final Comments)" -> "Proposed"
    const match = status.match(/^[a-zA-Z]+/);
    return match ? match[0] : "Unknown";
  }

  // Modify the parseTableRow method - replace the existing method
  parseTableRow(line, metadata) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 3) return;

    const field = parts[1].replace(/\*\*/g, "").toLowerCase().trim();
    const value = parts[2].replace(/\*\*/g, "").trim();

    if (field.includes("title")) {
      metadata.title = value;
    } else if (field.includes("author")) {
      metadata.authors = this.parseAuthors(value);
    } else if (field.includes("status")) {
      // Apply status cleaning here
      metadata.status = this.getCleanStatus(value);
    } else if (field.includes("track")) {
      metadata.track = value;
    } else if (field.includes("discussion")) {
      const discussionUrl = this.extractDiscussionUrl(value);
      if (discussionUrl) {
        metadata.discussions.push({
          url: discussionUrl,
          platform: this.detectPlatform(discussionUrl),
          title: "Primary Discussion",
        });
      }
    } else if (field.includes("created")) {
      metadata.proposed = value;
    } else if (field.includes("requires")) {
      metadata.requires = this.extractACPNumbers(value);
    } else if (field.includes("replaces")) {
      metadata.replaces = this.extractACPNumbers(value);
    }
  }

  async build() {
    console.log(
      "🚀 Enhanced ACP Builder - Starting comprehensive metadata extraction..."
    );

    try {
      // Ensure output directory exists
      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }

      // Check if ACPs directory exists
      if (!fs.existsSync(ACPS_DIR)) {
        console.error(`❌ ACPs directory not found at ${ACPS_DIR}`);
        console.log("🔧 Initializing submodule...");
        try {
          execSync("git submodule update --init --recursive", {
            stdio: "inherit",
          });
        } catch (error) {
          console.error("Failed to initialize submodule:", error);
          process.exit(1);
        }
      }

      // Read all ACP folders
      const folders = fs.readdirSync(ACPS_DIR).filter((name) => {
        const fullPath = path.join(ACPS_DIR, name);
        return fs.statSync(fullPath).isDirectory() && /^\d+-/.test(name);
      });

      console.log(`📁 Found ${folders.length} ACP folders`);

      // Process each ACP with enhanced metadata extraction
      for (const folderName of folders) {
        try {
          const acp = await this.processACPFolder(folderName);
          if (acp) {
            this.acps.push(acp);
            console.log(`✅ Processed ACP-${acp.number}: ${acp.title}`);
            console.log(
              `   📊 Complexity: ${acp.complexity}, Impact: ${acp.impact}, Reading time: ${acp.readingTime}min`
            );
          }
        } catch (error) {
          console.warn(`⚠️  Failed to process ${folderName}:`, error.message);
        }
      }

      // Calculate comprehensive statistics
      this.calculateStats();

      // Write processed data with metadata
      const output = {
        acps: this.acps,
        stats: this.stats,
        metadata: {
          lastUpdated: new Date().toISOString(),
          totalProcessed: this.acps.length,
          version: "2.0.0",
          extractionTimestamp: Date.now(),
        },
      };

      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
      console.log(`\n✅ Successfully processed ${this.acps.length} ACPs`);
      console.log(`📄 Data written to: ${OUTPUT_FILE}`);
      console.log(`\n📊 Statistics:`);
      console.log(`   Total ACPs: ${this.stats.total}`);
      console.log(
        `   Average reading time: ${this.stats.averageReadingTime.toFixed(
          1
        )} minutes`
      );
      console.log(`   Total unique authors: ${this.stats.totalAuthors.size}`);
      console.log(`   Recently updated: ${this.stats.recentlyUpdated}`);

      console.log("\n🎉 Enhanced build completed successfully!");
    } catch (error) {
      console.error("❌ Build failed:", error);
      process.exit(1);
    }
  }

  async processACPFolder(folderName) {
    const folderPath = path.join(ACPS_DIR, folderName);
    const readmePath = path.join(folderPath, "README.md");

    if (!fs.existsSync(readmePath)) {
      throw new Error(`README.md not found in ${folderName}`);
    }

    // Extract ACP number from folder name
    const match = folderName.match(/^(\d+)-/);
    if (!match) {
      throw new Error(`Invalid folder name format: ${folderName}`);
    }

    const number = match[1];
    const content = fs.readFileSync(readmePath, "utf-8");

    // Get git metadata if available
    const gitMetadata = this.getGitMetadata(readmePath);

    return this.parseEnhancedACPMarkdown(
      content,
      number,
      folderName,
      gitMetadata
    );
  }

  getGitMetadata(filePath) {
    try {
      // Check if git is available
      try {
        execSync("git --version", { stdio: "ignore" });
      } catch (error) {
        // Git not available, but don't warn in local development
        return { created: null, updated: null };
      }
      
      // Get relative path from git root to avoid absolute path issues
      const relativePath = path.relative(process.cwd(), filePath);
      // Get creation date
      const createdResult = spawnSync(
        "git",
        [
          "log",
          "--follow",
          "--format=%aI",
          "--diff-filter=A",
          "--",
          relativePath,
        ],
        {
          encoding: "utf-8",
          cwd: process.cwd(),
        }
      );

      let created = null;
      if (createdResult.status === 0 && createdResult.stdout) {
        const lines = createdResult.stdout.trim().split("\n").filter(Boolean);
        created = lines[lines.length - 1] || null; // Get the last (oldest) entry
      }

      // Get last modification date
      const updatedResult = spawnSync(
        "git",
        ["log", "-1", "--format=%aI", "--", relativePath],
        {
          encoding: "utf-8",
          cwd: process.cwd(),
        }
      );

      let updated = null;
      if (updatedResult.status === 0 && updatedResult.stdout) {
        updated = updatedResult.stdout.trim() || null;
      }

      return { created, updated };
    } catch (error) {
      console.warn(
        `⚠️  Could not get git metadata for ${filePath}:`,
        error.message
      );
      return { created: null, updated: null };
    }
  }

  parseEnhancedACPMarkdown(markdown, acpNumber, folderName, gitMetadata) {
    try {
      const lines = markdown.split("\n");

      // Initialize all metadata fields
      let metadata = {
        number: acpNumber,
        folderName: folderName,
        title: "",
        authors: [],
        status: "Unknown",
        track: "Unknown",
        abstract: "",
        motivation: "",
        specification: "",
        securityConsiderations: "",
        openQuestions: [],

        // Dates
        created: gitMetadata.created,
        updated: gitMetadata.updated,
        proposed: null,
        implementable: null,
        activated: null,
        stale: null,

        // Relationships
        requires: [],
        replaces: [],
        replacedBy: null,
        relatedAcps: [],

        // Implementation
        implementationStatus: "not-started",
        implementationUrl: null,
        referenceImplementation: null,

        // Content metrics
        wordCount: 0,
        readingTime: 0,
        codeBlockCount: 0,
        tableCount: 0,
        imageCount: 0,
        externalLinks: [],

        // Categorization
        complexity: "Medium",
        category: "Other",
        subcategory: null,
        tags: [],
        impact: "Medium",

        // Discussion
        discussions: [],
        primaryDiscussion: null,

        // Full content
        content: markdown,
      };

      // Parse sections
      let currentSection = "";
      let sectionContent = {};
      let inTable = false;
      let inCodeBlock = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Track code blocks
        if (trimmed.startsWith("```")) {
          inCodeBlock = !inCodeBlock;
          if (!inCodeBlock) metadata.codeBlockCount++;
          continue;
        }

        if (inCodeBlock) continue;

        // Track tables
        if (trimmed.startsWith("|") && !inTable) {
          inTable = true;
          metadata.tableCount++;
        } else if (!trimmed.startsWith("|") && inTable) {
          inTable = false;
        }

        // Track images
        if (trimmed.match(/!\[.*?\]\(.*?\)/)) {
          metadata.imageCount++;
        }

        // Extract external links
        const linkMatches = trimmed.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g);
        for (const match of linkMatches) {
          const url = match[2];
          if (url.startsWith("http")) {
            metadata.externalLinks.push({
              url: url,
              title: match[1],
              type: this.categorizeLink(url),
            });
          }
        }

        // Parse metadata table
        if (inTable && line.trim().startsWith("|") && !line.includes("---")) {
          this.parseTableRow(line, metadata);
        }

        // Track sections
        if (trimmed.startsWith("#")) {
          const sectionMatch = trimmed.match(/^#+\s+(.+)/);
          if (sectionMatch) {
            currentSection = sectionMatch[1].toLowerCase();
            sectionContent[currentSection] = "";
          }
        } else if (currentSection) {
          sectionContent[currentSection] += line + "\n";
        }
      }

      // Extract content from sections
      metadata.abstract = this.extractSection(
        sectionContent,
        "abstract",
        metadata.abstract
      );
      metadata.motivation = this.extractSection(
        sectionContent,
        "motivation",
        ""
      );
      metadata.specification = this.extractSection(
        sectionContent,
        "specification",
        ""
      );
      metadata.securityConsiderations = this.extractSection(
        sectionContent,
        "security considerations",
        ""
      );

      // Parse relationships
      metadata.requires = this.extractACPReferences(sectionContent, "requires");
      metadata.replaces = this.extractACPReferences(sectionContent, "replaces");
      metadata.replacedBy = this.extractSingleACPReference(
        sectionContent,
        "superseded by"
      );

      // Parse open questions
      if (sectionContent["open questions"]) {
        metadata.openQuestions = this.extractListItems(
          sectionContent["open questions"]
        );
      }

      // Calculate metrics
      metadata.wordCount = markdown.split(/\s+/).length;
      metadata.readingTime = Math.max(1, Math.ceil(metadata.wordCount / 200));

      // Determine complexity
      metadata.complexity = this.calculateComplexity(metadata);

      // Determine category
      metadata.category = this.determineCategory(
        metadata.title,
        metadata.content
      );

      // Extract tags
      metadata.tags = this.extractTags(metadata);

      // Determine impact
      metadata.impact = this.calculateImpact(metadata);

      // Set implementation status based on main status
      metadata.implementationStatus = this.getImplementationStatus(
        metadata.status
      );

      // Find primary discussion
      if (metadata.discussions.length > 0) {
        metadata.primaryDiscussion = metadata.discussions[0].url;
      }

      return metadata;
    } catch (error) {
      console.warn(`Failed to parse ACP-${acpNumber}:`, error.message);
      console.warn(`Full error for ACP-${acpNumber}:`, error);
      return null;
    }
  }

  parseAuthors(authorsStr) {
    if (!authorsStr) return [];

    const authors = [];
    const authorParts = authorsStr.split(/,\s*(?![^\[\]]*\])/g);

    for (const authorPart of authorParts) {
      const githubMatch = authorPart.match(/(.+?)\s*\(@(.+?)\)/);
      const linkMatch = authorPart.match(/\[(.+?)\]\((.+?)\)/);
      const emailMatch = authorPart.match(/(.+?)\s*\(([^@]+@[^)]+)\)/);

      let author = { name: "", github: "", email: "", organization: "" };

      if (githubMatch) {
        author.name = githubMatch[1].trim();
        author.github = githubMatch[2].trim();
      } else if (linkMatch) {
        author.name = linkMatch[1].trim();
        const link = linkMatch[2].trim();
        if (link.includes("github.com")) {
          author.github = link.split("/").pop() || "";
        }
      } else if (emailMatch) {
        author.name = emailMatch[1].trim();
        author.email = emailMatch[2].trim();
      } else {
        author.name = authorPart.trim();
      }

      // Try to extract organization from name if present
      const orgMatch = author.name.match(/(.+?)\s*\((.+?)\)/);
      if (orgMatch) {
        author.name = orgMatch[1].trim();
        author.organization = orgMatch[2].trim();
      }

      authors.push(author);
      this.stats.totalAuthors.add(author.name);
    }

    return authors;
  }

  extractSection(sectionContent, sectionName, defaultValue) {
    const content = sectionContent[sectionName];
    if (!content) return defaultValue;

    return content.trim().replace(/_/g, "\\_");
  }

  extractACPReferences(sectionContent, field) {
    const content = sectionContent[field] || "";
    return this.extractACPNumbers(content);
  }

  extractSingleACPReference(sectionContent, field) {
    const refs = this.extractACPReferences(sectionContent, field);
    return refs.length > 0 ? refs[0] : null;
  }

  extractACPNumbers(text) {
    const matches = text.matchAll(/ACP-(\d+)/gi);
    return [...matches].map((m) => m[1]);
  }

  extractListItems(text) {
    const items = [];
    const lines = text.split(/[•\-*]\s+/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && trimmed.length > 5) {
        items.push(trimmed);
      }
    }
    return items;
  }

  extractDiscussionUrl(discussionStr) {
    if (!discussionStr) return "";

    const urlMatch = discussionStr.match(/\(([^)]+)\)/);
    if (urlMatch) return urlMatch[1];

    if (discussionStr.startsWith("http")) return discussionStr;

    return "";
  }

  detectPlatform(url) {
    if (url.includes("github.com")) return "github";
    if (url.includes("forum")) return "forum";
    if (url.includes("discord")) return "discord";
    if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
    return "other";
  }

  categorizeLink(url) {
    if (url.includes("github.com") && url.includes("/pull/"))
      return "implementation";
    if (url.includes("github.com") && url.includes("/issues/"))
      return "discussion";
    if (url.includes("docs.") || url.includes("documentation"))
      return "documentation";
    if (url.includes("forum") || url.includes("discuss")) return "discussion";
    return "reference";
  }

  calculateComplexity(metadata) {
    let score = 0;

    // Length-based scoring
    if (metadata.wordCount > 3000) score += 3;
    else if (metadata.wordCount > 1500) score += 2;
    else score += 1;

    // Code complexity
    if (metadata.codeBlockCount > 10) score += 3;
    else if (metadata.codeBlockCount > 5) score += 2;
    else if (metadata.codeBlockCount > 0) score += 1;

    // Technical indicators
    const technicalTerms = [
      "algorithm",
      "cryptographic",
      "consensus",
      "protocol",
      "implementation",
      "architecture",
      "optimization",
      "performance",
    ];
    const contentLower = metadata.content.toLowerCase();
    const technicalCount = technicalTerms.filter((term) =>
      contentLower.includes(term)
    ).length;
    score += Math.min(3, technicalCount);

    // Dependencies
    score += Math.min(2, metadata.requires.length);

    // Calculate final complexity
    if (score >= 10) return "Very High";
    if (score >= 7) return "High";
    if (score >= 4) return "Medium";
    return "Low";
  }

  determineCategory(title, content) {
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();
    const combined = titleLower + " " + contentLower;

    const categories = {
      Consensus: ["consensus", "validator", "staking", "delegation"],
      Networking: ["network", "p2p", "peer", "communication", "message"],
      "Virtual Machine": ["vm", "virtual machine", "execution", "evm", "wasm"],
      Economics: ["fee", "economic", "incentive", "reward", "tokenomics"],
      Governance: ["governance", "voting", "proposal", "vote"],
      Security: ["security", "cryptographic", "signature", "encryption"],
      Performance: ["performance", "optimization", "efficiency", "speed"],
      Interoperability: ["interop", "bridge", "cross-chain", "teleporter"],
      API: ["api", "interface", "endpoint", "rpc"],
      Tooling: ["tool", "cli", "sdk", "library"],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      const matchCount = keywords.filter((keyword) =>
        combined.includes(keyword)
      ).length;
      if (
        matchCount >= 2 ||
        (matchCount === 1 && keywords.some((k) => titleLower.includes(k)))
      ) {
        return category;
      }
    }

    return "Other";
  }

  extractTags(metadata) {
    const tags = new Set();
    const content = (metadata.title + " " + metadata.content).toLowerCase();

    const tagKeywords = {
      consensus: ["consensus", "validator", "staking"],
      networking: ["network", "p2p", "communication"],
      economics: ["fee", "economic", "incentive"],
      governance: ["governance", "voting"],
      security: ["security", "cryptographic"],
      performance: ["performance", "optimization"],
      interoperability: ["interop", "bridge", "cross-chain"],
      vm: ["virtual machine", "vm", "execution"],
      api: ["api", "interface", "endpoint"],
      upgrade: ["upgrade", "migration", "update"],
      deprecation: ["deprecate", "remove", "sunset"],
    };

    for (const [tag, keywords] of Object.entries(tagKeywords)) {
      if (keywords.some((keyword) => content.includes(keyword))) {
        tags.add(tag);
      }
    }

    // Add track as tag
    if (metadata.track && metadata.track !== "Unknown") {
      tags.add(metadata.track.toLowerCase().replace(" track", ""));
    }

    // Add status as tag if significant
    if (
      ["Activated", "Implementable", "Stale", "Withdrawn"].includes(
        metadata.status
      )
    ) {
      tags.add(metadata.status.toLowerCase());
    }

    return Array.from(tags);
  }

  calculateImpact(metadata) {
    let score = 0;

    // Status weight
    if (metadata.status === "Activated") score += 4;
    else if (metadata.status === "Implementable") score += 3;
    else if (metadata.status === "Proposed") score += 2;
    else score += 1;

    // Track weight
    if (metadata.track === "Standards Track") score += 3;
    else if (metadata.track === "Meta Track") score += 2;
    else score += 1;

    // Complexity weight
    if (metadata.complexity === "Very High") score += 3;
    else if (metadata.complexity === "High") score += 2;
    else if (metadata.complexity === "Medium") score += 1;

    // Category weight
    if (["Consensus", "Security", "Economics"].includes(metadata.category))
      score += 2;

    // Dependencies indicator
    if (metadata.requires.length > 2) score += 2;
    else if (metadata.requires.length > 0) score += 1;

    // Calculate final impact
    if (score >= 12) return "Critical";
    if (score >= 8) return "High";
    if (score >= 5) return "Medium";
    return "Low";
  }

  getImplementationStatus(status) {
    switch (status) {
      case "Activated":
        return "deployed";
      case "Implementable":
        return "completed";
      case "Proposed":
      case "Review":
        return "in-progress";
      default:
        return "not-started";
    }
  }

  calculateStats() {
    this.stats.total = this.acps.length;

    let totalReadingTime = 0;
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    this.acps.forEach((acp) => {
      // Status stats
      this.stats.byStatus[acp.status] =
        (this.stats.byStatus[acp.status] || 0) + 1;

      // Track stats
      this.stats.byTrack[acp.track] = (this.stats.byTrack[acp.track] || 0) + 1;

      // Complexity stats
      this.stats.byComplexity[acp.complexity] =
        (this.stats.byComplexity[acp.complexity] || 0) + 1;

      // Category stats
      this.stats.byCategory[acp.category] =
        (this.stats.byCategory[acp.category] || 0) + 1;

      // Impact stats
      this.stats.byImpact[acp.impact] =
        (this.stats.byImpact[acp.impact] || 0) + 1;

      // Implementation progress
      this.stats.implementationProgress[acp.implementationStatus]++;

      // Reading time
      totalReadingTime += acp.readingTime;

      // Recently updated
      if (acp.updated && new Date(acp.updated).getTime() > thirtyDaysAgo) {
        this.stats.recentlyUpdated++;
      }

      // Needs attention (stale or withdrawn but not resolved)
      if (["Stale", "Withdrawn"].includes(acp.status) && !acp.replacedBy) {
        this.stats.needsAttention++;
      }
    });

    this.stats.averageReadingTime = totalReadingTime / this.acps.length;
  }
}

async function main() {
  const builder = new EnhancedACPBuilder();
  try {
    await builder.build();
  } catch (error) {
    console.error("💥 Fatal error in build script:", error);
    process.exit(1);
  }
}

// Space-safe entry point check
const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1];

// Normalize both paths to handle spaces and different path formats
const isMainModule =
  path.resolve(currentFilePath) === path.resolve(executedFilePath);
// mian func call 
if (isMainModule) {
  main();
}
