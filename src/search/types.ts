/**
 * @file types.ts
 * @module search/types
 * @author Dominic Rodemer
 * @created 2025-12-14
 * @license MIT
 *
 * @fileoverview Type definitions for the search index functionality.
 */

/**
 * Entry to be indexed in the search database.
 */
export interface SearchEntry {
    id?: number;
    /** Symbol name (e.g., "UIWindow") */
    name: string;
    /** Entry type (e.g., "Class", "Method", "Property") */
    type: string;
    /** Programming language (e.g., "swift", "objc") */
    language?: string;
    /** Framework name (e.g., "UIKit", "Foundation") */
    framework?: string;
    /** Relative path to the markdown file */
    path: string;
    /** Brief description/abstract */
    abstract?: string;
    /** Code declaration/signature */
    declaration?: string;
    /** Whether the entry is deprecated */
    deprecated?: boolean;
    /** Whether the entry is in beta */
    beta?: boolean;
}

/**
 * Search result with relevance score.
 */
export interface SearchResult extends SearchEntry {
    /** BM25 relevance score */
    score: number;
}

/**
 * Options for filtering search results.
 */
export interface SearchOptions {
    /** Filter by entry type */
    type?: string;
    /** Filter by framework */
    framework?: string;
    /** Filter by language */
    language?: string;
    /** Maximum number of results */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
}

/**
 * Output format for search results.
 */
export type OutputFormat = 'simple' | 'table' | 'json';

/**
 * Search response containing results and metadata.
 */
export interface SearchResponse {
    results: SearchResult[];
    total: number;
    query: string;
    options: SearchOptions;
}
