import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { CacheReader } from '../db/CacheReader.js';
import { generateUuid } from './UuidGenerator.js';
import type { DocCDocument } from '../parser/types.js';

export class ContentExtractor {
  private cacheReader: CacheReader;
  private fsDir: string;
  private decompressedCache: Map<number, Buffer> = new Map();
  private brotliPath: string | null = null;

  constructor(docsetPath: string) {
    const cacheDbPath = join(docsetPath, 'Contents/Resources/Documents/cache.db');
    this.cacheReader = new CacheReader(cacheDbPath);
    this.fsDir = join(docsetPath, 'Contents/Resources/Documents/fs');

    // Check for brotli CLI tool
    this.brotliPath = this.findBrotli();
  }

  private findBrotli(): string | null {
    try {
      const path = execSync('which brotli', { encoding: 'utf-8' }).trim();
      return path || null;
    } catch {
      return null;
    }
  }

  /**
   * Extract documentation content by request key.
   */
  extractByRequestKey(requestKey: string): DocCDocument | null {
    const uuid = generateUuid(requestKey);
    return this.extractByUuid(uuid);
  }

  /**
   * Extract documentation content by UUID.
   */
  extractByUuid(uuid: string): DocCDocument | null {
    const ref = this.cacheReader.getRef(uuid);
    if (!ref) {
      return null;
    }

    return this.extractFromFs(ref.dataId, ref.offset, ref.length);
  }

  /**
   * Extract JSON from fs file at specific offset.
   */
  private extractFromFs(dataId: number, offset: number, length: number): DocCDocument | null {
    const fsFile = join(this.fsDir, String(dataId));

    if (!existsSync(fsFile)) {
      return null;
    }

    try {
      // Get or decompress the fs file
      let decompressed = this.decompressedCache.get(dataId);

      if (decompressed === undefined) {
        const result = this.decompressFile(fsFile);
        if (result === null) {
          return null;
        }
        decompressed = result;
        this.decompressedCache.set(dataId, decompressed);
      }

      // Extract JSON at offset
      const jsonData = decompressed.subarray(offset, offset + length);
      const doc = JSON.parse(jsonData.toString('utf-8')) as DocCDocument;

      // Validate it's a proper DocC document
      if (doc.metadata || doc.schemaVersion) {
        return doc;
      }

      return null;
    } catch (error) {
      // Silently fail for invalid entries
      return null;
    }
  }

  /**
   * Decompress a brotli-compressed file.
   */
  private decompressFile(filePath: string): Buffer | null {
    // Try brotli decompression using CLI tool
    if (this.brotliPath) {
      try {
        const result = execSync(`"${this.brotliPath}" -d -c "${filePath}"`, {
          maxBuffer: 500 * 1024 * 1024, // 500MB buffer
          encoding: 'buffer',
        });
        return result;
      } catch {
        // File might not be brotli compressed, return raw content
        return readFileSync(filePath);
      }
    }

    // If no brotli CLI, try reading as raw file (for PNG images, etc.)
    return readFileSync(filePath);
  }

  /**
   * Preload specific fs files into cache for better performance.
   */
  preloadDataIds(dataIds: number[]): void {
    for (const dataId of dataIds) {
      if (this.decompressedCache.has(dataId)) {
        continue;
      }

      const fsFile = join(this.fsDir, String(dataId));
      if (existsSync(fsFile)) {
        const decompressed = this.decompressFile(fsFile);
        if (decompressed) {
          this.decompressedCache.set(dataId, decompressed);
        }
      }
    }
  }

  /**
   * Clear the decompression cache to free memory.
   */
  clearCache(): void {
    this.decompressedCache.clear();
  }

  /**
   * Get the size of the decompression cache.
   */
  getCacheSize(): number {
    let size = 0;
    for (const buffer of this.decompressedCache.values()) {
      size += buffer.length;
    }
    return size;
  }

  /**
   * Check if content exists for a request key.
   */
  hasContent(requestKey: string): boolean {
    const uuid = generateUuid(requestKey);
    return this.cacheReader.hasRef(uuid);
  }

  close(): void {
    this.cacheReader.close();
    this.clearCache();
  }
}
