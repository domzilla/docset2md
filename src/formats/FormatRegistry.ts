/**
 * Registry for docset format detection and instantiation
 */

import type { DocsetFormat } from './types.js';
import { AppleDocCFormat } from './AppleDocCFormat.js';
import { StandardDashFormat } from './StandardDashFormat.js';
import { CoreDataFormat } from './CoreDataFormat.js';

export class FormatRegistry {
  private formats: DocsetFormat[] = [];

  constructor() {
    // Register formats in priority order (most specific first)
    this.formats = [
      new AppleDocCFormat(),    // Apple DocC with cache.db + fs/
      new CoreDataFormat(),     // CoreData schema with ZTOKEN tables
      new StandardDashFormat(), // Simple searchIndex + HTML (fallback)
    ];
  }

  /**
   * Detect the format of a docset and return an initialized handler
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
   * Get format by name
   */
  getFormatByName(name: string): DocsetFormat | undefined {
    return this.formats.find(f => f.getName() === name);
  }

  /**
   * Get all registered formats
   */
  getFormats(): DocsetFormat[] {
    return [...this.formats];
  }

  /**
   * Get format names
   */
  getFormatNames(): string[] {
    return this.formats.map(f => f.getName());
  }
}
