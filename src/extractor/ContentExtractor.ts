/**
 * @file ContentExtractor.ts
 * @module extractor/ContentExtractor
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Extracts DocC JSON content from brotli-compressed fs/ files.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { CacheReader } from '../db/CacheReader.js';
import { generateUuid } from './UuidGenerator.js';
import type { DocCDocument } from '../parser/types.js';

/**
 * Options for ContentExtractor.
 */
export interface ContentExtractorOptions {
  /** Enable downloading missing content from Apple's API (default: false) */
  enableDownload?: boolean;
}

/**
 * Extracts documentation content from Apple DocC docsets.
 *
 * The extraction process:
 * 1. Generate UUID from request key
 * 2. Look up (dataId, offset, length) in cache.db
 * 3. Decompress fs/{dataId} with brotli
 * 4. Extract JSON at offset:offset+length
 * 5. Parse and return DocCDocument
 *
 * Decompressed files are cached in memory for performance.
 *
 * @example
 * ```typescript
 * const extractor = new ContentExtractor('/path/to/docset');
 * const doc = extractor.extractByRequestKey('ls/documentation/uikit/uiwindow');
 * if (doc) {
 *   console.log(doc.metadata?.title);
 * }
 * extractor.close();
 * ```
 */
export class ContentExtractor {
  private cacheReader: CacheReader;
  private fsDir: string;
  private decompressedCache: Map<number, Buffer> = new Map();
  private brotliPath: string | null = null;
  private enableDownload: boolean;
  private downloadedCache: Map<string, DocCDocument | null> = new Map();

  /**
   * Create a new ContentExtractor.
   * @param docsetPath - Path to the .docset directory
   * @param options - Optional configuration
   */
  constructor(docsetPath: string, options?: ContentExtractorOptions) {
    const cacheDbPath = join(docsetPath, 'Contents/Resources/Documents/cache.db');
    this.cacheReader = new CacheReader(cacheDbPath);
    this.fsDir = join(docsetPath, 'Contents/Resources/Documents/fs');
    this.enableDownload = options?.enableDownload ?? false;

    // Check for brotli CLI tool
    this.brotliPath = this.findBrotli();
  }

  /**
   * Find the brotli CLI tool on the system.
   * @returns Path to brotli executable or null if not found
   */
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
   * If the local fs file is missing and downloading is enabled, attempts to
   * fetch the content from Apple's documentation API.
   * @param requestKey - Request key from the index (e.g., "ls/documentation/uikit/uiwindow")
   * @returns Parsed DocCDocument or null if not found
   */
  extractByRequestKey(requestKey: string): DocCDocument | null {
    const uuid = generateUuid(requestKey);
    const doc = this.extractByUuid(uuid);

    // If local extraction failed and downloading is enabled, try to fetch from Apple's API
    if (doc === null && this.enableDownload) {
      return this.downloadFromApi(requestKey);
    }

    return doc;
  }

  /**
   * Extract documentation content by UUID.
   * @param uuid - Cache UUID (generated from request key)
   * @returns Parsed DocCDocument or null if not found
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
   * @param dataId - ID of the data file in fs/
   * @param offset - Byte offset in decompressed data
   * @param length - Length of JSON content
   * @returns Parsed DocCDocument or null on error
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
   * Falls back to raw file if brotli decompression fails.
   * @param filePath - Path to the compressed file
   * @returns Decompressed buffer or null on error
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
   * Useful when processing many entries from the same data files.
   * @param dataIds - Array of data file IDs to preload
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
   * Call this periodically when processing large docsets.
   */
  clearCache(): void {
    this.decompressedCache.clear();
  }

  /**
   * Get the total size of the decompression cache in bytes.
   * @returns Total bytes of cached decompressed data
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
   * @param requestKey - Request key to check
   * @returns true if content is available in the cache
   */
  hasContent(requestKey: string): boolean {
    const uuid = generateUuid(requestKey);
    return this.cacheReader.hasRef(uuid);
  }

  /**
   * Download documentation content from Apple's API.
   * The API URL is constructed from the request key:
   * - Request key: ls/documentation/photos/phvideorequestoptions
   * - API URL: https://developer.apple.com/tutorials/data/documentation/photos/phvideorequestoptions.json
   *
   * @param requestKey - Request key to download
   * @returns Parsed DocCDocument or null if download fails
   */
  private downloadFromApi(requestKey: string): DocCDocument | null {
    // Check cache first
    if (this.downloadedCache.has(requestKey)) {
      return this.downloadedCache.get(requestKey) ?? null;
    }

    // Convert request key to API URL
    // Remove language prefix (ls/ or lc/) and add .json extension
    const match = requestKey.match(/^l[sc]\/(.+)$/);
    if (!match) {
      this.downloadedCache.set(requestKey, null);
      return null;
    }

    const docPath = match[1];
    const apiUrl = `https://developer.apple.com/tutorials/data/${docPath}.json`;

    try {
      // Use curl to download (synchronous, avoids async complexity)
      const result = execSync(`curl -s -f "${apiUrl}"`, {
        encoding: 'utf-8',
        timeout: 30000, // 30 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      const doc = JSON.parse(result) as DocCDocument;

      // Validate it's a proper DocC document
      if (doc.metadata || doc.schemaVersion) {
        this.downloadedCache.set(requestKey, doc);
        return doc;
      }

      this.downloadedCache.set(requestKey, null);
      return null;
    } catch {
      // Download or parsing failed
      this.downloadedCache.set(requestKey, null);
      return null;
    }
  }

  /**
   * Close the extractor and release resources.
   * Closes the cache reader and clears the decompression cache.
   */
  close(): void {
    this.cacheReader.close();
    this.clearCache();
    this.downloadedCache.clear();
  }

  /**
   * Get the number of downloaded documents.
   * @returns Number of documents fetched from Apple's API
   */
  getDownloadCount(): number {
    let count = 0;
    for (const doc of this.downloadedCache.values()) {
      if (doc !== null) count++;
    }
    return count;
  }
}
