/**
 * @file DocCConverter.ts
 * @module docc/DocCConverter
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Converter for DocC docsets with Language/Framework/Item.md structure.
 */

import { join } from 'node:path';
import type { DocsetFormat, NormalizedEntry, ParsedContent, ContentItem } from '../shared/formats/types.js';
import type { MarkdownGenerator } from '../shared/MarkdownGenerator.js';
import { BaseConverter } from '../shared/converter/BaseConverter.js';

/**
 * Converter for Apple DocC format docsets.
 *
 * Output structure: Language/Framework/Item.md
 * - swift/uikit/uiwindow.md
 * - objective-c/uikit/uiwindow.md
 *
 * Generates:
 * - Framework indexes: swift/uikit/_index.md
 * - Language root indexes: swift/_index.md
 *
 * @example
 * ```typescript
 * const format = await registry.detectFormat('/path/to/Apple.docset');
 * const converter = new DocCConverter(format);
 * const result = await converter.convert({ outputDir: './output' });
 * ```
 */
export class DocCConverter extends BaseConverter {
  /** Track items for index generation: framework -> language -> items */
  private frameworkItems: Map<string, Map<string, ContentItem[]>> = new Map();
  /** Track seen entries to avoid duplicates */
  private seenEntries: Set<string> = new Set();

  /**
   * Create a new DocCConverter.
   * @param format - The initialized DocC format handler
   */
  constructor(format: DocsetFormat) {
    super(format);
  }

  /**
   * Reset index tracking state.
   */
  protected resetIndexTracking(): void {
    this.frameworkItems.clear();
    this.seenEntries.clear();
  }

  /**
   * Determine the output file path for an Apple entry.
   *
   * Structure: Language/Framework/Path.md
   * e.g., swift/uikit/uiwindow.md or swift/uikit/uiwindow/rootviewcontroller.md
   *
   * @param entry - The entry to get path for
   * @param content - Parsed content for the entry
   * @param outputDir - Base output directory
   * @returns Full file path for the markdown output
   */
  getOutputPath(
    entry: NormalizedEntry,
    content: ParsedContent,
    outputDir: string
  ): string {
    const langDir = entry.language === 'swift' ? 'swift' : 'objective-c';
    const framework = (content.framework || 'other').toLowerCase();

    // Build path from entry.path (request key)
    const match = entry.path.match(/l[sc]\/documentation\/(.+)/);
    let filePath: string;

    if (match) {
      const docPath = match[1];
      const parts = docPath.split('/').map(p => p.toLowerCase());

      if (parts.length === 1) {
        // Framework root
        filePath = join(outputDir, langDir, parts[0], '_index.md');
      } else {
        // Nested item
        const dirParts = parts.slice(0, -1);
        const fileName = this.sanitizeFileName(parts[parts.length - 1]) + '.md';
        filePath = join(outputDir, langDir, ...dirParts, fileName);
      }
    } else {
      // Fallback
      filePath = join(outputDir, langDir, framework, this.sanitizeFileName(entry.name) + '.md');
    }

    return filePath;
  }

  /**
   * Track an entry for index generation.
   *
   * @param entry - Entry being processed
   * @param content - Parsed content
   * @param filePath - Output file path
   * @param outputDir - Base output directory
   */
  protected trackForIndex(
    entry: NormalizedEntry,
    content: ParsedContent,
    filePath: string,
    outputDir: string
  ): void {
    const key = `${entry.type}:${entry.name}:${entry.language || ''}`;
    if (this.seenEntries.has(key)) return;
    this.seenEntries.add(key);

    // Calculate relative URL from the framework index
    // e.g., path "ls/documentation/xpc/xpclistener/incomingsessionrequest" -> "./xpclistener/incomingsessionrequest.md"
    let relativeUrl: string;
    const pathMatch = entry.path.match(/l[sc]\/documentation\/[^/]+\/(.+)/);
    if (pathMatch) {
      relativeUrl = `./${pathMatch[1].toLowerCase()}.md`;
    } else {
      relativeUrl = `./${this.sanitizeFileName(entry.name)}.md`;
    }

    const item: ContentItem = {
      title: entry.name,
      url: relativeUrl,
      abstract: content.abstract,
      deprecated: content.deprecated,
      beta: content.beta,
    };

    // Track by framework and language
    let framework = (content.framework || 'other').toLowerCase();
    const fwMatch = entry.path.match(/l[sc]\/documentation\/([^/]+)/);
    if (fwMatch) {
      framework = fwMatch[1].toLowerCase();
    }

    if (!this.frameworkItems.has(framework)) {
      this.frameworkItems.set(framework, new Map());
    }
    const langItems = this.frameworkItems.get(framework)!;
    const lang = entry.language || 'swift';

    if (!langItems.has(lang)) {
      langItems.set(lang, []);
    }

    // Only add top-level types to index (exclude 'Framework' as it's represented by _index.md)
    if (['Class', 'Struct', 'Protocol', 'Enum'].includes(entry.type)) {
      langItems.get(lang)!.push(item);
    }
  }

  /**
   * Generate all index files for Apple docsets.
   *
   * Creates:
   * - Framework indexes: swift/uikit/_index.md
   * - Language root indexes: swift/_index.md
   *
   * @param outputDir - Base output directory
   * @param generator - Markdown generator for index content
   */
  generateIndexes(outputDir: string, generator: MarkdownGenerator): void {
    // Generate framework indexes
    for (const [framework, langItems] of this.frameworkItems) {
      for (const [lang, items] of langItems) {
        if (items.length === 0) continue;

        const langDir = lang === 'swift' ? 'swift' : 'objective-c';
        const indexContent = generator.generateIndex(
          framework,
          `Documentation for the ${framework} framework.`,
          items.sort((a, b) => a.title.localeCompare(b.title)).map(this.convertToTopicItem)
        );

        const indexPath = join(outputDir, langDir, framework, '_index.md');
        this.writeFile(indexPath, indexContent);
      }
    }

    // Generate language root indexes
    for (const lang of ['swift', 'objc'] as const) {
      const langDir = lang === 'swift' ? 'swift' : 'objective-c';
      const frameworks = Array.from(this.frameworkItems.keys())
        .filter(fw => this.frameworkItems.get(fw)?.has(lang))
        .sort()
        .map(fw => ({
          title: fw,
          url: `./${fw}/_index.md`,
        }));

      if (frameworks.length === 0) continue;

      const langTitle = lang === 'swift' ? 'Swift' : 'Objective-C';
      const indexContent = generator.generateIndex(
        `${langTitle} Documentation`,
        `API documentation in ${langTitle}.`,
        frameworks.map(this.convertToTopicItem)
      );

      const indexPath = join(outputDir, langDir, '_index.md');
      this.writeFile(indexPath, indexContent);
    }
  }
}
