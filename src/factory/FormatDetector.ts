/**
 * @file FormatDetector.ts
 * @module factory/FormatDetector
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Auto-detection of docset format handlers.
 */

import type { DocsetFormat, FormatInitOptions } from '../shared/formats/types.js';
import { DocCFormat } from '../docc/DocCFormat.js';
import { StandardFormat } from '../standard/StandardFormat.js';
import { CoreDataFormat } from '../coredata/CoreDataFormat.js';

/**
 * Detector for docset format identification and instantiation.
 *
 * Maintains a priority-ordered list of format handlers and provides
 * automatic format detection. The first handler that can process a
 * docset will be returned.
 *
 * Format priority order:
 * 1. Apple DocC (cache.db + fs/)
 * 2. CoreData (ZTOKEN tables)
 * 3. Standard Dash (searchIndex + HTML, fallback)
 *
 * @example
 * ```typescript
 * const detector = new FormatDetector();
 * const format = await detector.detectFormat('./PHP.docset');
 * if (format) {
 *   console.log(`Detected: ${format.getName()}`);
 *   // Use format to iterate entries...
 * }
 * ```
 */
export class FormatDetector {
  private formats: DocsetFormat[] = [];

  /**
   * Create a new FormatDetector with default format handlers.
   */
  constructor() {
    // Register formats in priority order (most specific first)
    this.formats = [
      new DocCFormat(),      // DocC with cache.db + fs/
      new CoreDataFormat(),  // CoreData schema with ZTOKEN tables
      new StandardFormat(),  // Simple searchIndex + HTML (fallback)
    ];
  }

  /**
   * Detect the format of a docset and return an initialized handler.
   *
   * Tries each registered format in priority order until one detects
   * the docset successfully, then initializes and returns that handler.
   *
   * @param docsetPath - Path to the .docset directory
   * @param options - Optional format-specific initialization options
   * @returns Initialized format handler, or null if no format matches
   */
  async detectFormat(docsetPath: string, options?: FormatInitOptions): Promise<DocsetFormat | null> {
    for (const format of this.formats) {
      if (await format.detect(docsetPath)) {
        await format.initialize(docsetPath, options);
        return format;
      }
    }
    return null;
  }

  /**
   * Get a format handler by its name.
   * @param name - Format name (e.g., "Apple DocC", "Standard Dash")
   * @returns Format handler or undefined if not found
   */
  getFormatByName(name: string): DocsetFormat | undefined {
    return this.formats.find(f => f.getName() === name);
  }

  /**
   * Get all registered format handlers.
   * @returns Copy of the format handlers array
   */
  getFormats(): DocsetFormat[] {
    return [...this.formats];
  }

  /**
   * Get the names of all registered formats.
   * @returns Array of format names
   */
  getFormatNames(): string[] {
    return this.formats.map(f => f.getName());
  }
}
