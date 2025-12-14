/**
 * @file types.ts
 * @module shared/formats/types
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Unified interfaces for handling multiple docset formats.
 */

/**
 * Entry from any docset format, normalized to a common structure.
 *
 * Represents a single documentation entry regardless of the underlying
 * docset format. The format handler normalizes entries from format-specific
 * structures (searchIndex, ZTOKEN, etc.) to this common interface.
 */
export interface NormalizedEntry {
  /** Unique identifier for the entry (numeric ID or string key) */
  id: number | string;
  /** Display name of the entry (e.g., "UIWindow", "array_map") */
  name: string;
  /** Entry type (e.g., "Class", "Function", "Protocol") */
  type: string;
  /** Path to the documentation content */
  path: string;
  /** Programming language ("swift", "objc", or undefined for generic) */
  language?: string;
  /** Framework or category the entry belongs to */
  framework?: string;
}

/**
 * Parsed content ready for markdown generation.
 *
 * Contains all documentation information extracted from an entry,
 * structured for easy conversion to markdown output.
 */
export interface ParsedContent {
  /** Page title */
  title: string;
  /** Entry type (Class, Function, etc.) */
  type: string;
  /** Programming language */
  language?: string;
  /** Framework or category */
  framework?: string;
  /** Brief description/summary */
  abstract?: string;
  /** Code declaration/signature */
  declaration?: string;
  /** Main description content (already in markdown) */
  description?: string;
  /** Function/method parameters */
  parameters?: Array<{ name: string; description: string }>;
  /** Return value description */
  returnValue?: string;
  /** Topic sections with grouped items */
  topics?: Array<{ title: string; items: ContentItem[] }>;
  /** See Also references */
  seeAlso?: ContentItem[];
  /** Relationship sections (inherits, conforms to, etc.) */
  relationships?: Array<{ kind: string; title: string; items: ContentItem[] }>;
  /** Breadcrumb hierarchy */
  hierarchy?: string[];
  /** Whether the entry is deprecated */
  deprecated?: boolean;
  /** Whether the entry is in beta */
  beta?: boolean;
  /** Supported platforms with versions */
  platforms?: Array<{ name: string; version?: string }>;
}

/**
 * Item in topic/relationship sections.
 *
 * Represents a linked reference to another documentation entry,
 * typically displayed as a list item with optional metadata.
 */
export interface ContentItem {
  /** Display title for the item */
  title: string;
  /** URL or path to the referenced documentation */
  url?: string;
  /** Brief description of the item */
  abstract?: string;
  /** Whether this is a required implementation (for protocols) */
  required?: boolean;
  /** Whether this item is deprecated */
  deprecated?: boolean;
  /** Whether this item is in beta */
  beta?: boolean;
}

/**
 * Filters for querying docset entries.
 *
 * Used to limit which entries are processed during conversion.
 * All filters are optional; omitted filters match all entries.
 */
export interface EntryFilters {
  /** Filter by entry types (e.g., ["Class", "Protocol"]) */
  types?: string[];
  /** Filter by frameworks (e.g., ["UIKit", "Foundation"]) */
  frameworks?: string[];
  /** Filter by languages (e.g., ["swift", "objc"]) */
  languages?: string[];
  /** Maximum number of entries to process */
  limit?: number;
}

/**
 * Options for format initialization.
 *
 * Format-specific options that can be passed during initialization.
 */
export interface FormatInitOptions {
  /** For Apple DocC: enable downloading missing content from Apple's API */
  enableDownload?: boolean;
}

/**
 * Strategy interface for docset format handlers.
 *
 * Each docset format (Apple DocC, Standard Dash, CoreData) implements
 * this interface, allowing the converter to work with any format
 * through a unified API.
 *
 * @example
 * ```typescript
 * const format: DocsetFormat = new DocCFormat();
 * if (await format.detect(docsetPath)) {
 *   await format.initialize(docsetPath);
 *   for (const entry of format.iterateEntries()) {
 *     const content = await format.extractContent(entry);
 *     // Generate markdown...
 *   }
 *   format.close();
 * }
 * ```
 */
export interface DocsetFormat {
  /**
   * Detect if this format applies to the given docset.
   * @param docsetPath - Path to the .docset directory
   * @returns true if this format can handle the docset
   */
  detect(docsetPath: string): Promise<boolean>;

  /**
   * Get format name for display.
   * @returns Human-readable format name (e.g., "Apple DocC")
   */
  getName(): string;

  /**
   * Initialize format handler with docset path.
   * Opens databases and prepares for content extraction.
   * @param docsetPath - Path to the .docset directory
   * @param options - Optional format-specific options
   */
  initialize(docsetPath: string, options?: FormatInitOptions): Promise<void>;

  /**
   * Check if the format has been initialized.
   * @returns true if initialize() has been called successfully
   */
  isInitialized(): boolean;

  /**
   * Get total entry count with optional filters.
   * @param filters - Optional filters to apply
   * @returns Number of matching entries
   */
  getEntryCount(filters?: EntryFilters): number;

  /**
   * Iterate over entries (memory efficient).
   * Yields entries one at a time to support large docsets.
   * @param filters - Optional filters to apply
   * @yields NormalizedEntry for each matching entry
   */
  iterateEntries(filters?: EntryFilters): Generator<NormalizedEntry>;

  /**
   * Extract and parse content for an entry.
   * @param entry - Entry to extract content for
   * @returns Parsed content or null if extraction fails
   */
  extractContent(entry: NormalizedEntry): Promise<ParsedContent | null>;

  /**
   * Get available entry types.
   * @returns Array of type names (e.g., ["Class", "Function", "Protocol"])
   */
  getTypes(): string[];

  /**
   * Get available frameworks/categories.
   * @returns Array of framework names
   */
  getCategories(): string[];

  /**
   * Check if format supports multiple languages.
   * @returns true if docset has Swift and Objective-C variants
   */
  supportsMultipleLanguages(): boolean;

  /**
   * Get supported languages (if multi-language).
   * @returns Array of language identifiers (e.g., ["swift", "objc"])
   */
  getLanguages(): string[];

  /**
   * Cleanup resources.
   * Closes database connections and clears caches.
   */
  close(): void;
}

/**
 * Link mapping for internal link resolution.
 *
 * Maps HTML filenames to their corresponding output paths,
 * enabling internal links to be converted from .html to .md format.
 */
export interface LinkMapping {
  /** Output path relative to output root (e.g., "interface/iteratoraggregate.md") */
  outputPath: string;
  /** Entry type (e.g., "Interface", "Class") */
  type: string;
  /** Entry name (e.g., "IteratorAggregate") */
  name: string;
}

/**
 * Docset metadata from Info.plist.
 *
 * Contains information about the docset read from the Info.plist
 * file in the docset bundle.
 */
export interface DocsetInfo {
  /** Bundle identifier (e.g., "com.apple.UIKit") */
  bundleIdentifier?: string;
  /** Display name of the docset */
  bundleName?: string;
  /** Platform family (e.g., "iphoneos", "macosx") */
  docsetPlatformFamily?: string;
  /** Path to the index file within the docset */
  dashIndexFilePath?: string;
  /** Whether this is a Dash-compatible docset */
  isDashDocset?: boolean;
  /** Whether JavaScript is enabled for this docset */
  isJavaScriptEnabled?: boolean;
  /** Dash docset family (e.g., "dashtoc") */
  dashDocSetFamily?: string;
}
