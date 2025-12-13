/**
 * @file AppleAppleApiDownloader.ts
 * @module docc/AppleAppleApiDownloader
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Downloads missing DocC documentation from Apple's public API.
 */

import { execSync } from 'node:child_process';
import type { DocCDocument } from './types.js';

/**
 * Statistics for download operations.
 */
export interface DownloadStats {
  /** Number of download attempts */
  attempted: number;
  /** Number of successful downloads */
  successful: number;
  /** Number of failed downloads */
  failed: number;
  /** Number of cache hits */
  cached: number;
}

/**
 * Options for AppleApiDownloader.
 */
export interface AppleApiDownloaderOptions {
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum response buffer size in bytes (default: 10MB) */
  maxBuffer?: number;
}

/**
 * Downloads missing documentation content from Apple's public API.
 *
 * The API URL is constructed from the request key:
 * - Request key: `ls/documentation/photos/phvideorequestoptions`
 * - API URL: `https://developer.apple.com/tutorials/data/documentation/photos/phvideorequestoptions.json`
 *
 * Downloaded documents are cached in memory to avoid redundant requests.
 *
 * @example
 * ```typescript
 * const downloader = new AppleApiDownloader();
 * const doc = downloader.download('ls/documentation/uikit/uiwindow');
 * if (doc) {
 *   console.log(doc.metadata?.title);
 * }
 * console.log(downloader.getStats());
 * ```
 */
export class AppleApiDownloader {
  private cache: Map<string, DocCDocument | null> = new Map();
  private timeout: number;
  private maxBuffer: number;
  private stats: DownloadStats = {
    attempted: 0,
    successful: 0,
    failed: 0,
    cached: 0,
  };

  /**
   * Create a new AppleApiDownloader.
   * @param options - Optional configuration
   */
  constructor(options?: AppleApiDownloaderOptions) {
    this.timeout = options?.timeout ?? 30000;
    this.maxBuffer = options?.maxBuffer ?? 10 * 1024 * 1024; // 10MB
  }

  /**
   * Download a document from Apple's API by request key.
   *
   * @param requestKey - Request key (e.g., "ls/documentation/uikit/uiwindow")
   * @returns Parsed DocCDocument or null if download fails
   */
  download(requestKey: string): DocCDocument | null {
    // Check cache first
    if (this.cache.has(requestKey)) {
      this.stats.cached++;
      return this.cache.get(requestKey) ?? null;
    }

    this.stats.attempted++;

    // Convert request key to API URL
    // Remove language prefix (ls/ or lc/) and add .json extension
    const match = requestKey.match(/^l[sc]\/(.+)$/);
    if (!match) {
      this.stats.failed++;
      this.cache.set(requestKey, null);
      return null;
    }

    const docPath = match[1];
    const apiUrl = `https://developer.apple.com/tutorials/data/${docPath}.json`;

    try {
      // Use curl to download (synchronous, avoids async complexity)
      const result = execSync(`curl -s -f "${apiUrl}"`, {
        encoding: 'utf-8',
        timeout: this.timeout,
        maxBuffer: this.maxBuffer,
      });

      const doc = JSON.parse(result) as DocCDocument;

      // Validate it's a proper DocC document
      if (doc.metadata || doc.schemaVersion) {
        this.stats.successful++;
        this.cache.set(requestKey, doc);
        return doc;
      }

      this.stats.failed++;
      this.cache.set(requestKey, null);
      return null;
    } catch {
      // Download or parsing failed
      this.stats.failed++;
      this.cache.set(requestKey, null);
      return null;
    }
  }

  /**
   * Check if a document is in the cache.
   * @param requestKey - Request key to check
   * @returns true if the request key has been cached (regardless of success)
   */
  isCached(requestKey: string): boolean {
    return this.cache.has(requestKey);
  }

  /**
   * Check if a document was successfully cached.
   * @param requestKey - Request key to check
   * @returns true if the document was successfully downloaded and cached
   */
  hasDocument(requestKey: string): boolean {
    return this.cache.get(requestKey) !== null && this.cache.get(requestKey) !== undefined;
  }

  /**
   * Get download statistics.
   * @returns Statistics about download operations
   */
  getStats(): DownloadStats {
    return { ...this.stats };
  }

  /**
   * Get the number of successfully downloaded documents.
   * @returns Number of documents fetched from Apple's API
   */
  getDownloadCount(): number {
    let count = 0;
    for (const doc of this.cache.values()) {
      if (doc !== null) count++;
    }
    return count;
  }

  /**
   * Clear the download cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      attempted: 0,
      successful: 0,
      failed: 0,
      cached: 0,
    };
  }
}
