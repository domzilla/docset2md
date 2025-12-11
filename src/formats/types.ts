/**
 * Format abstraction types for multi-format docset support
 */

/**
 * Entry from any docset format, normalized to a common structure
 */
export interface NormalizedEntry {
  id: number | string;
  name: string;
  type: string;
  path: string;
  language?: string;
  framework?: string;
}

/**
 * Parsed content ready for markdown generation
 */
export interface ParsedContent {
  title: string;
  type: string;
  language?: string;
  framework?: string;
  abstract?: string;
  declaration?: string;
  description?: string;
  parameters?: Array<{ name: string; description: string }>;
  returnValue?: string;
  topics?: Array<{ title: string; items: ContentItem[] }>;
  seeAlso?: ContentItem[];
  relationships?: Array<{ kind: string; title: string; items: ContentItem[] }>;
  hierarchy?: string[];
  deprecated?: boolean;
  beta?: boolean;
  platforms?: Array<{ name: string; version?: string }>;
}

/**
 * Item in topic/relationship sections
 */
export interface ContentItem {
  title: string;
  url?: string;
  abstract?: string;
  required?: boolean;
  deprecated?: boolean;
  beta?: boolean;
}

/**
 * Filters for querying docset entries
 */
export interface EntryFilters {
  types?: string[];
  frameworks?: string[];
  languages?: string[];
  limit?: number;
}

/**
 * Strategy interface for docset format handlers
 */
export interface DocsetFormat {
  /**
   * Detect if this format applies to the given docset
   */
  detect(docsetPath: string): Promise<boolean>;

  /**
   * Get format name for display
   */
  getName(): string;

  /**
   * Initialize format handler with docset path
   */
  initialize(docsetPath: string): Promise<void>;

  /**
   * Check if the format has been initialized
   */
  isInitialized(): boolean;

  /**
   * Get total entry count with optional filters
   */
  getEntryCount(filters?: EntryFilters): number;

  /**
   * Iterate over entries (memory efficient)
   */
  iterateEntries(filters?: EntryFilters): Generator<NormalizedEntry>;

  /**
   * Extract and parse content for an entry
   */
  extractContent(entry: NormalizedEntry): Promise<ParsedContent | null>;

  /**
   * Get available entry types
   */
  getTypes(): string[];

  /**
   * Get available frameworks/categories
   */
  getCategories(): string[];

  /**
   * Check if format supports multiple languages
   */
  supportsMultipleLanguages(): boolean;

  /**
   * Get supported languages (if multi-language)
   */
  getLanguages(): string[];

  /**
   * Cleanup resources
   */
  close(): void;
}

/**
 * Docset metadata from Info.plist
 */
export interface DocsetInfo {
  bundleIdentifier?: string;
  bundleName?: string;
  docsetPlatformFamily?: string;
  dashIndexFilePath?: string;
  isDashDocset?: boolean;
  isJavaScriptEnabled?: boolean;
  dashDocSetFamily?: string;
}
