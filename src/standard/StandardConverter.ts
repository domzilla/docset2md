/**
 * @file StandardConverter.ts
 * @module standard/StandardConverter
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Converter for Standard docsets with Type/Item.md structure.
 */

import { join } from 'node:path';
import type { DocsetFormat, NormalizedEntry, ParsedContent, ContentItem } from '../shared/formats/types.js';
import type { MarkdownGenerator } from '../shared/MarkdownGenerator.js';
import { BaseConverter } from '../shared/converter/BaseConverter.js';
import type { StandardFormat } from './StandardFormat.js';

/**
 * Converter for Standard Dash format docsets.
 *
 * Output structure: Type/Item.md
 * - function/array_map.md
 * - class/datetime.md
 *
 * Generates:
 * - Type indexes: function/_index.md
 * - Root index: _index.md
 *
 * @example
 * ```typescript
 * const format = await registry.detectFormat('/path/to/PHP.docset');
 * const converter = new StandardConverter(format, 'PHP');
 * const result = await converter.convert({ outputDir: './output' });
 * ```
 */
export class StandardConverter extends BaseConverter {
  /** Track items by type for index generation */
  protected typeItems: Map<string, ContentItem[]> = new Map();
  /** Name of the docset for root index title */
  protected docsetName: string;

  /**
   * Create a new StandardConverter.
   * @param format - The initialized Standard format handler
   * @param docsetName - Name of the docset for index titles
   */
  constructor(format: DocsetFormat, docsetName: string) {
    super(format);
    this.docsetName = docsetName;
  }

  /**
   * Reset index tracking state and build link mapping.
   *
   * The link mapping enables internal .html links in the content to be
   * converted to their corresponding .md output paths.
   */
  protected resetIndexTracking(): void {
    this.typeItems.clear();

    // Build and set link mapping for internal link resolution
    const standardFormat = this.format as StandardFormat;
    if (typeof standardFormat.buildLinkMapping === 'function') {
      const linkMap = standardFormat.buildLinkMapping();
      standardFormat.setLinkMapping(linkMap);
    }
  }

  /**
   * Determine the output file path for a Standard Dash entry.
   *
   * Structure: Type/Item.md
   * e.g., function/array_map.md, class/datetime.md
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
    const typeDir = entry.type.toLowerCase();
    const fileName = this.sanitizeFileName(entry.name) + '.md';
    return join(outputDir, typeDir, fileName);
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
    const relativeUrl = `./${this.sanitizeFileName(entry.name)}.md`;

    const item: ContentItem = {
      title: entry.name,
      url: relativeUrl,
      abstract: content.abstract,
      deprecated: content.deprecated,
      beta: content.beta,
    };

    const type = entry.type.toLowerCase();
    if (!this.typeItems.has(type)) {
      this.typeItems.set(type, []);
    }
    this.typeItems.get(type)!.push(item);
  }

  /**
   * Generate all index files for Standard Dash docsets.
   *
   * Creates:
   * - Type indexes: function/_index.md
   * - Root index: _index.md
   *
   * @param outputDir - Base output directory
   * @param generator - Markdown generator for index content
   */
  generateIndexes(outputDir: string, generator: MarkdownGenerator): void {
    // Generate type indexes
    for (const [type, items] of this.typeItems) {
      if (items.length === 0) continue;

      const indexContent = generator.generateIndex(
        type,
        `${type} entries.`,
        items.sort((a, b) => a.title.localeCompare(b.title)).map(this.convertToTopicItem)
      );

      const indexPath = join(outputDir, type, '_index.md');
      this.writeFile(indexPath, indexContent);
    }

    // Generate root index
    const types = Array.from(this.typeItems.keys())
      .filter(t => this.typeItems.get(t)!.length > 0)
      .sort()
      .map(t => ({
        title: `${t} (${this.typeItems.get(t)!.length})`,
        url: `./${t}/_index.md`,
      }));

    if (types.length > 0) {
      const rootIndex = generator.generateIndex(
        this.docsetName.replace('.docset', ''),
        'Documentation index.',
        types.map(this.convertToTopicItem)
      );

      const rootPath = join(outputDir, '_index.md');
      this.writeFile(rootPath, rootIndex);
    }
  }
}
