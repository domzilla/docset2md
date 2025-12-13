/**
 * @file BaseConverter.ts
 * @module converter/BaseConverter
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Abstract base class for docset converters with shared logic.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DocsetFormat, NormalizedEntry, ParsedContent, ContentItem } from '../formats/types.js';
import type { ParsedDocumentation, TopicItem } from '../parser/types.js';
import { MarkdownGenerator } from '../generator/MarkdownGenerator.js';
import type {
  DocsetConverter,
  ConverterOptions,
  ConversionResult,
  ProgressCallback,
  WriteStats,
} from './types.js';

/**
 * Abstract base class providing shared conversion logic.
 *
 * Subclasses must implement:
 * - getOutputPath(): Define output file structure
 * - generateIndexes(): Generate format-specific index files
 * - trackForIndex(): Track items for index generation
 *
 * @example
 * ```typescript
 * class MyConverter extends BaseConverter {
 *   getOutputPath(entry, content, outputDir) {
 *     return join(outputDir, entry.type, `${entry.name}.md`);
 *   }
 *
 *   generateIndexes(outputDir, generator) {
 *     // Generate index files
 *   }
 *
 *   protected trackForIndex(entry, content, filePath, outputDir) {
 *     // Track items for index generation
 *   }
 * }
 * ```
 */
export abstract class BaseConverter implements DocsetConverter {
  protected format: DocsetFormat;
  protected generator: MarkdownGenerator;
  protected createdDirs: Set<string> = new Set();
  protected filesWritten = 0;
  protected bytesWritten = 0;

  /**
   * Create a new BaseConverter.
   * @param format - The initialized format handler
   */
  constructor(format: DocsetFormat) {
    this.format = format;
    this.generator = new MarkdownGenerator();
  }

  /**
   * Get the format handler.
   */
  getFormat(): DocsetFormat {
    return this.format;
  }

  /**
   * Get the format name for display.
   */
  getFormatName(): string {
    return this.format.getName();
  }

  /**
   * Main conversion loop - shared across all formats.
   *
   * @param options - Conversion options
   * @param onProgress - Optional progress callback
   * @returns Conversion result with statistics
   */
  async convert(
    options: ConverterOptions,
    onProgress?: ProgressCallback
  ): Promise<ConversionResult> {
    const startTime = Date.now();
    let processed = 0;
    let successful = 0;
    let failed = 0;

    // Reset state
    this.createdDirs.clear();
    this.filesWritten = 0;
    this.bytesWritten = 0;
    this.resetIndexTracking();

    // Ensure output directory exists
    if (!existsSync(options.outputDir)) {
      mkdirSync(options.outputDir, { recursive: true });
    }

    const totalCount = this.format.getEntryCount(options.filters);
    const limit = options.filters?.limit;

    for (const entry of this.format.iterateEntries(options.filters)) {
      if (limit && processed >= limit) break;
      processed++;

      if (onProgress) {
        onProgress(processed, limit ?? totalCount, entry);
      }

      try {
        const content = await this.format.extractContent(entry);
        if (!content) {
          if (options.verbose) {
            console.log(`  -> No content found for: ${entry.name}`);
          }
          failed++;
          continue;
        }

        const markdown = this.generateMarkdown(content);
        const filePath = this.getOutputPath(entry, content, options.outputDir);

        this.writeFile(filePath, markdown);
        this.trackForIndex(entry, content, filePath, options.outputDir);

        successful++;
      } catch (error) {
        if (options.verbose) {
          console.error(`  -> Error processing ${entry.name}:`, error);
        }
        failed++;
      }
    }

    // Generate index files
    this.generateIndexes(options.outputDir, this.generator);

    return {
      processed,
      successful,
      failed,
      writeStats: {
        filesWritten: this.filesWritten,
        directoriesCreated: this.createdDirs.size,
        bytesWritten: this.bytesWritten,
      },
      elapsedMs: Date.now() - startTime,
    };
  }

  /**
   * Convert ParsedContent to markdown string.
   * Shared across all converters.
   *
   * @param content - Parsed content from format handler
   * @returns Markdown string
   */
  protected generateMarkdown(content: ParsedContent): string {
    const doc: ParsedDocumentation = {
      title: content.title,
      kind: content.type,
      role: content.type,
      language: (content.language as 'swift' | 'objc') || 'swift',
      framework: content.framework,
      abstract: content.abstract,
      declaration: content.declaration,
      overview: content.description,
      parameters: content.parameters,
      returnValue: content.returnValue,
      topics: content.topics?.map(t => ({
        title: t.title,
        items: t.items.map(this.convertToTopicItem),
      })),
      seeAlso: content.seeAlso
        ? [{ title: 'See Also', items: content.seeAlso.map(this.convertToTopicItem) }]
        : undefined,
      relationships: content.relationships?.map(r => ({
        kind: r.kind,
        title: r.title,
        items: r.items.map(this.convertToTopicItem),
      })),
      hierarchy: content.hierarchy,
      deprecated: content.deprecated,
      beta: content.beta,
      platforms: content.platforms?.map(p => ({
        name: p.name,
        introducedAt: p.version,
      })),
    };

    return this.generator.generate(doc);
  }

  /**
   * Convert ContentItem to TopicItem.
   *
   * @param item - Content item to convert
   * @returns TopicItem for use in MarkdownGenerator
   */
  protected convertToTopicItem(item: ContentItem): TopicItem {
    return {
      title: item.title,
      url: item.url,
      abstract: item.abstract,
      required: item.required,
      deprecated: item.deprecated,
      beta: item.beta,
    };
  }

  /**
   * Write a file, ensuring directory exists.
   *
   * @param filePath - Full path to write
   * @param content - File content
   */
  protected writeFile(filePath: string, content: string): void {
    const dir = dirname(filePath);
    this.ensureDir(dir);
    writeFileSync(filePath, content, 'utf-8');
    this.filesWritten++;
    this.bytesWritten += Buffer.byteLength(content, 'utf-8');
  }

  /**
   * Ensure directory exists.
   *
   * @param dir - Directory path to ensure exists
   */
  protected ensureDir(dir: string): void {
    if (!this.createdDirs.has(dir)) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      this.createdDirs.add(dir);
    }
  }

  /**
   * Sanitize a string for use as a filename.
   *
   * Removes/replaces invalid characters, truncates long names, and
   * converts method signatures to unique filenames.
   *
   * @param name - Raw name to sanitize
   * @returns Safe filename string
   */
  protected sanitizeFileName(name: string): string {
    let sanitized = name;

    // Handle method signatures: convert parameters to underscore-separated format
    // e.g., init(frame:) → init_frame, perform(_:with:afterDelay:) → perform_with_afterdelay
    if (sanitized.includes('(')) {
      const parenIndex = sanitized.indexOf('(');
      const methodName = sanitized.substring(0, parenIndex);
      const paramsSection = sanitized.substring(parenIndex);

      // Extract parameter labels from signature
      const paramLabels = paramsSection
        .replace(/[()]/g, '') // Remove parentheses
        .split(':') // Split by colons
        .map(p => p.trim().split(/\s+/).pop() || '') // Get the label (last word before colon)
        .filter(p => p && p !== '_') // Remove empty and underscore-only labels
        .join('_');

      sanitized = paramLabels ? `${methodName}_${paramLabels}` : methodName;
    }

    sanitized = sanitized
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/__+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100);
    }

    // Lowercase for case-insensitive consistency across filesystems
    return (sanitized || 'unnamed').toLowerCase();
  }

  /**
   * Close the converter and release resources.
   */
  close(): void {
    this.format.close();
  }

  /**
   * Reset index tracking state.
   * Called at the start of each conversion.
   */
  protected abstract resetIndexTracking(): void;

  /**
   * Determine the output file path for an entry.
   *
   * @param entry - The entry to get path for
   * @param content - Parsed content for the entry
   * @param outputDir - Base output directory
   * @returns Full file path for the markdown output
   */
  abstract getOutputPath(
    entry: NormalizedEntry,
    content: ParsedContent,
    outputDir: string
  ): string;

  /**
   * Generate all index files for the conversion output.
   *
   * @param outputDir - Base output directory
   * @param generator - Markdown generator for index content
   */
  abstract generateIndexes(outputDir: string, generator: MarkdownGenerator): void;

  /**
   * Track an entry for index generation.
   *
   * @param entry - Entry being processed
   * @param content - Parsed content
   * @param filePath - Output file path
   * @param outputDir - Base output directory
   */
  protected abstract trackForIndex(
    entry: NormalizedEntry,
    content: ParsedContent,
    filePath: string,
    outputDir: string
  ): void;
}
