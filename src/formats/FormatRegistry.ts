/**
 * Format Registry for docset format detection
 *
 * Manages registration and detection of docset format handlers.
 * Automatically detects the correct format for a docset and returns
 * an initialized handler.
 *
 * @module formats/FormatRegistry
 */

import type { DocsetFormat } from './types.js';
import { AppleDocCFormat } from './AppleDocCFormat.js';
import { StandardDashFormat } from './StandardDashFormat.js';
import { CoreDataFormat } from './CoreDataFormat.js';

/**
 * Registry for docset format detection and instantiation.
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
 * const registry = new FormatRegistry();
 * const format = await registry.detectFormat('./PHP.docset');
 * if (format) {
 *   console.log(`Detected: ${format.getName()}`);
 *   // Use format to iterate entries...
 * }
 * ```
 */
export class FormatRegistry {
  private formats: DocsetFormat[] = [];

  /**
   * Create a new FormatRegistry with default format handlers.
   */
  constructor() {
    // Register formats in priority order (most specific first)
    this.formats = [
      new AppleDocCFormat(),    // Apple DocC with cache.db + fs/
      new CoreDataFormat(),     // CoreData schema with ZTOKEN tables
      new StandardDashFormat(), // Simple searchIndex + HTML (fallback)
    ];
  }

  /**
   * Detect the format of a docset and return an initialized handler.
   *
   * Tries each registered format in priority order until one detects
   * the docset successfully, then initializes and returns that handler.
   *
   * @param docsetPath - Path to the .docset directory
   * @returns Initialized format handler, or null if no format matches
   */
  async detectFormat(docsetPath: string): Promise<DocsetFormat | null> {
    for (const format of this.formats) {
      if (await format.detect(docsetPath)) {
        await format.initialize(docsetPath);
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
