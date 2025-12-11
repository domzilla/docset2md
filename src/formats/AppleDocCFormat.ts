/**
 * Apple DocC format handler
 *
 * Handles Apple's proprietary docset format with:
 * - searchIndex table in docSet.dsidx
 * - cache.db with refs table for UUID-to-location mapping
 * - Brotli-compressed DocC JSON in fs/ directory
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

export class AppleDocCFormat implements DocsetFormat {
  private docsetPath: string = '';
  private indexReader: IndexReader | null = null;
  private extractor: ContentExtractor | null = null;
  private parser: DocCParser = new DocCParser();
  private initialized = false;

  getName(): string {
    return 'Apple DocC';
  }

  async detect(docsetPath: string): Promise<boolean> {
    // Apple format has: searchIndex (in docSet.dsidx), cache.db, and fs/ directory
    const hasIndex = existsSync(join(docsetPath, 'Contents/Resources/docSet.dsidx'));
    const hasCache = existsSync(join(docsetPath, 'Contents/Resources/Documents/cache.db'));
    const hasFs = existsSync(join(docsetPath, 'Contents/Resources/Documents/fs'));

    return hasIndex && hasCache && hasFs;
  }

  async initialize(docsetPath: string): Promise<void> {
    this.docsetPath = docsetPath;
    const indexPath = join(docsetPath, 'Contents/Resources/docSet.dsidx');
    this.indexReader = new IndexReader(indexPath);
    this.extractor = new ContentExtractor(docsetPath);
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getEntryCount(filters?: EntryFilters): number {
    if (!this.indexReader) throw new Error('Not initialized');
    return this.indexReader.getCount(this.convertFilters(filters));
  }

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

  async extractContent(entry: NormalizedEntry): Promise<ParsedContent | null> {
    if (!this.extractor) throw new Error('Not initialized');

    const doc = this.extractor.extractByRequestKey(entry.path);
    if (!doc) return null;

    const lang = (entry.language as 'swift' | 'objc') ?? 'swift';
    const parsed = this.parser.parse(doc, lang);

    return this.convertParsedDoc(parsed);
  }

  getTypes(): string[] {
    if (!this.indexReader) return [];
    return this.indexReader.getTypes();
  }

  getCategories(): string[] {
    if (!this.indexReader) return [];
    return this.indexReader.getFrameworks();
  }

  supportsMultipleLanguages(): boolean {
    return true;
  }

  getLanguages(): string[] {
    return ['swift', 'objc'];
  }

  close(): void {
    this.indexReader?.close();
    this.extractor?.close();
    this.initialized = false;
  }

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
