/**
 * @file AppleDocCFormat.ts
 * @module formats/AppleDocCFormat
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Handler for Apple DocC docsets with brotli-compressed JSON content.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DocsetFormat,
  NormalizedEntry,
  ParsedContent,
  EntryFilters,
  ContentItem,
} from './types.js';
import { IndexReader } from '../db/IndexReader.js';
import { ContentExtractor } from '../extractor/ContentExtractor.js';
import { DocCParser } from '../parser/DocCParser.js';
import type { ParsedDocumentation, TopicItem } from '../parser/types.js';

/**
 * Format handler for Apple DocC docsets.
 *
 * Apple DocC docsets use a sophisticated format:
 * 1. Index entries stored in searchIndex table with request keys
 * 2. Content locations cached in cache.db (UUID -> dataId, offset, length)
 * 3. Actual content stored as DocC JSON in brotli-compressed fs/ files
 *
 * @implements {DocsetFormat}
 *
 * @example
 * ```typescript
 * const format = new AppleDocCFormat();
 * if (await format.detect('./Apple_UIKit_Reference.docset')) {
 *   await format.initialize('./Apple_UIKit_Reference.docset');
 *   console.log(`Found ${format.getEntryCount()} entries`);
 *   format.close();
 * }
 * ```
 */
export class AppleDocCFormat implements DocsetFormat {
  private docsetPath: string = '';
  private indexReader: IndexReader | null = null;
  private extractor: ContentExtractor | null = null;
  private parser: DocCParser = new DocCParser();
  private initialized = false;
  private languageMap: Map<string, Set<'swift' | 'objc'>> | null = null;

  /** @inheritdoc */
  getName(): string {
    return 'Apple DocC';
  }

  /**
   * Detect if a docset is in Apple DocC format.
   *
   * Apple DocC format is identified by the presence of:
   * - docSet.dsidx with searchIndex table
   * - cache.db with refs table
   * - fs/ directory with brotli-compressed content
   *
   * @param docsetPath - Path to the .docset directory
   * @returns true if this is an Apple DocC docset
   */
  async detect(docsetPath: string): Promise<boolean> {
    // Apple format has: searchIndex (in docSet.dsidx), cache.db, and fs/ directory
    const hasIndex = existsSync(join(docsetPath, 'Contents/Resources/docSet.dsidx'));
    const hasCache = existsSync(join(docsetPath, 'Contents/Resources/Documents/cache.db'));
    const hasFs = existsSync(join(docsetPath, 'Contents/Resources/Documents/fs'));

    return hasIndex && hasCache && hasFs;
  }

  /** @inheritdoc */
  async initialize(docsetPath: string): Promise<void> {
    this.docsetPath = docsetPath;
    const indexPath = join(docsetPath, 'Contents/Resources/docSet.dsidx');
    this.indexReader = new IndexReader(indexPath);
    this.extractor = new ContentExtractor(docsetPath);

    // Build language availability map for cross-language link resolution
    this.languageMap = this.indexReader.buildLanguageAvailabilityMap();

    // Pass the lookup function to the parser
    this.parser.setLanguageAvailabilityLookup((docPath: string) => {
      return this.languageMap?.get(docPath);
    });

    this.initialized = true;
  }

  /** @inheritdoc */
  isInitialized(): boolean {
    return this.initialized;
  }

  /** @inheritdoc */
  getEntryCount(filters?: EntryFilters): number {
    if (!this.indexReader) throw new Error('Not initialized');
    return this.indexReader.getCount(this.convertFilters(filters));
  }

  /** @inheritdoc */
  *iterateEntries(filters?: EntryFilters): Generator<NormalizedEntry> {
    if (!this.indexReader) throw new Error('Not initialized');

    const convertedFilters = this.convertFilters(filters);
    let count = 0;
    const limit = filters?.limit;

    for (const entry of this.indexReader.iterateEntries(convertedFilters)) {
      if (limit && count >= limit) break;

      yield {
        id: entry.id,
        name: entry.name,
        type: entry.type,
        path: entry.requestKey,
        language: entry.language,
      };

      count++;
    }
  }

  /** @inheritdoc */
  async extractContent(entry: NormalizedEntry): Promise<ParsedContent | null> {
    if (!this.extractor) throw new Error('Not initialized');

    const doc = this.extractor.extractByRequestKey(entry.path);
    if (!doc) return null;

    const lang = (entry.language as 'swift' | 'objc') ?? 'swift';

    // Set source document path and language for correct relative link resolution
    this.parser.setSourceDocumentPath(entry.path, lang);

    const parsed = this.parser.parse(doc, lang);

    // Clear source path after parsing
    this.parser.clearSourceDocumentPath();

    return this.convertParsedDoc(parsed);
  }

  /** @inheritdoc */
  getTypes(): string[] {
    if (!this.indexReader) return [];
    return this.indexReader.getTypes();
  }

  /** @inheritdoc */
  getCategories(): string[] {
    if (!this.indexReader) return [];
    return this.indexReader.getFrameworks();
  }

  /** @inheritdoc */
  supportsMultipleLanguages(): boolean {
    return true;
  }

  /** @inheritdoc */
  getLanguages(): string[] {
    return ['swift', 'objc'];
  }

  /** @inheritdoc */
  close(): void {
    this.indexReader?.close();
    this.extractor?.close();
    this.languageMap = null;
    this.initialized = false;
  }

  /**
   * Convert generic EntryFilters to IndexReader-specific filter format.
   * @param filters - Generic entry filters
   * @returns IndexReader-compatible filter object
   */
  private convertFilters(filters?: EntryFilters): {
    types?: string[];
    frameworks?: string[];
    languages?: Array<'swift' | 'objc'>;
    limit?: number;
  } | undefined {
    if (!filters) return undefined;

    return {
      types: filters.types,
      frameworks: filters.frameworks,
      languages: filters.languages?.map(l => l as 'swift' | 'objc'),
      limit: filters.limit,
    };
  }

  /**
   * Convert ParsedDocumentation from DocCParser to generic ParsedContent.
   * @param parsed - DocC-specific parsed documentation
   * @returns Generic ParsedContent for markdown generation
   */
  private convertParsedDoc(parsed: ParsedDocumentation): ParsedContent {
    return {
      title: parsed.title,
      type: parsed.role,
      language: parsed.language,
      framework: parsed.framework,
      abstract: parsed.abstract,
      declaration: parsed.declaration,
      description: parsed.overview,
      parameters: parsed.parameters,
      returnValue: parsed.returnValue,
      topics: parsed.topics?.map(t => ({
        title: t.title,
        items: t.items.map(this.convertTopicItem),
      })),
      seeAlso: parsed.seeAlso?.flatMap(s => s.items.map(this.convertTopicItem)),
      relationships: parsed.relationships?.map(r => ({
        kind: r.kind,
        title: r.title,
        items: r.items.map(this.convertTopicItem),
      })),
      hierarchy: parsed.hierarchy,
      deprecated: parsed.deprecated,
      beta: parsed.beta,
      platforms: parsed.platforms?.map(p => ({
        name: p.name,
        version: p.introducedAt,
      })),
    };
  }

  /**
   * Convert a DocC TopicItem to generic ContentItem.
   * @param item - DocC-specific topic item
   * @returns Generic ContentItem for markdown generation
   */
  private convertTopicItem(item: TopicItem): ContentItem {
    return {
      title: item.title,
      url: item.url,
      abstract: item.abstract,
      required: item.required,
      deprecated: item.deprecated,
      beta: item.beta,
    };
  }
}
