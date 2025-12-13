/**
 * @file ConverterRegistry.ts
 * @module converter/ConverterRegistry
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Maps format handlers to their corresponding converters.
 */

import type { DocsetFormat } from '../formats/types.js';
import type { DocsetConverter } from './types.js';
import { AppleConverter } from './AppleConverter.js';
import { StandardDashConverter } from './StandardDashConverter.js';
import { CoreDataConverter } from './CoreDataConverter.js';

/**
 * Factory for creating converters based on format handlers.
 *
 * @example
 * ```typescript
 * const format = await registry.detectFormat('/path/to/docset');
 * const converter = ConverterRegistry.createConverter(format, 'MyDocset');
 * const result = await converter.convert({ outputDir: './output' });
 * ```
 */
export class ConverterRegistry {
  /**
   * Create a converter for the given format handler.
   *
   * @param format - Initialized format handler
   * @param docsetName - Name of the docset (for index titles)
   * @returns Appropriate converter for the format
   */
  static createConverter(format: DocsetFormat, docsetName: string): DocsetConverter {
    const formatName = format.getName();

    switch (formatName) {
      case 'Apple DocC':
        return new AppleConverter(format);
      case 'Standard Dash':
        return new StandardDashConverter(format, docsetName);
      case 'CoreData':
        return new CoreDataConverter(format, docsetName);
      default:
        // Fallback to StandardDash for unknown formats
        return new StandardDashConverter(format, docsetName);
    }
  }
}
