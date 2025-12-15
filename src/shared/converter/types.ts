/**
 * @file types.ts
 * @module shared/converter/types
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Type definitions for docset converters.
 */

import type { DocsetFormat, NormalizedEntry, ParsedContent, EntryFilters } from '../formats/types.js';
import type { MarkdownGenerator } from '../markdown-generator.js';
import type { WriteStats } from '../file-writer.js';

export type { WriteStats };

/**
 * Configuration options for a converter.
 */
export interface ConverterOptions {
    /** Output directory for generated files */
    outputDir: string;
    /** Enable verbose logging */
    verbose?: boolean;
    /** Entry filters (types, frameworks, languages, limit) */
    filters?: EntryFilters;
    /** Generate searchable index (search.db) */
    generateIndex?: boolean;
}

/**
 * Result of a conversion operation.
 */
export interface ConversionResult {
    /** Total entries processed */
    processed: number;
    /** Entries successfully converted */
    successful: number;
    /** Entries that failed conversion */
    failed: number;
    /** File write statistics */
    writeStats: WriteStats;
    /** Time taken in milliseconds */
    elapsedMs: number;
    /** Number of entries indexed (if generateIndex enabled) */
    indexEntries?: number;
    /** Whether the search binary was built successfully */
    searchBinaryBuilt?: boolean;
}

/**
 * Progress callback for tracking conversion progress.
 *
 * @param current - Current entry number being processed
 * @param total - Total number of entries to process
 * @param entry - The entry currently being processed
 */
export type ProgressCallback = (current: number, total: number, entry: NormalizedEntry) => void;

/**
 * Converter interface for processing docsets.
 *
 * Each converter implementation handles a specific docset format,
 * controlling output structure, path resolution, and index generation.
 */
export interface DocsetConverter {
    /**
     * Get the format handler this converter works with.
     */
    getFormat(): DocsetFormat;

    /**
     * Get the format name for display.
     */
    getFormatName(): string;

    /**
     * Convert the docset to markdown files.
     *
     * @param options - Conversion options
     * @param onProgress - Optional progress callback
     * @returns Conversion result with statistics
     */
    convert(options: ConverterOptions, onProgress?: ProgressCallback): Promise<ConversionResult>;

    /**
     * Determine the output file path for an entry.
     *
     * @param entry - The entry to get path for
     * @param content - Parsed content for the entry
     * @param outputDir - Base output directory
     * @returns Full file path for the markdown output
     */
    getOutputPath(entry: NormalizedEntry, content: ParsedContent, outputDir: string): string;

    /**
     * Generate all index files for the conversion output.
     *
     * @param outputDir - Base output directory
     * @param generator - Markdown generator for index content
     */
    generateIndexes(outputDir: string, generator: MarkdownGenerator): void;

    /**
     * Clean up resources.
     */
    close(): void;
}
