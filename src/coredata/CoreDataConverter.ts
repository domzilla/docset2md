/**
 * @file CoreDataConverter.ts
 * @module coredata/CoreDataConverter
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Converter for CoreData-based docsets with Type/Item.md structure.
 */

import type { DocsetFormat } from '../shared/formats/types.js';
import { StandardConverter } from '../standard/StandardConverter.js';
import type { CoreDataFormat } from './CoreDataFormat.js';

/**
 * Converter for CoreData format docsets.
 *
 * CoreData docsets use the same output structure as Standard Dash,
 * so this class extends StandardConverter.
 *
 * Output structure: Type/Item.md
 * - function/array_map.md
 * - class/datetime.md
 *
 * @example
 * ```typescript
 * const format = await registry.detectFormat('/path/to/CoreData.docset');
 * const converter = new CoreDataConverter(format, 'CoreData');
 * const result = await converter.convert({ outputDir: './output' });
 * ```
 */
export class CoreDataConverter extends StandardConverter {
  /**
   * Create a new CoreDataConverter.
   * @param format - The initialized CoreData format handler
   * @param docsetName - Name of the docset for index titles
   */
  constructor(format: DocsetFormat, docsetName: string) {
    super(format, docsetName);
  }

  /**
   * Reset index tracking state and build link mapping.
   *
   * Overrides StandardConverter to use CoreDataFormat's link mapping methods.
   */
  protected resetIndexTracking(): void {
    this.typeItems.clear();

    // Build and set link mapping for internal link resolution
    const coreDataFormat = this.format as CoreDataFormat;
    if (typeof coreDataFormat.buildLinkMapping === 'function') {
      const linkMap = coreDataFormat.buildLinkMapping();
      coreDataFormat.setLinkMapping(linkMap);
    }
  }
}
