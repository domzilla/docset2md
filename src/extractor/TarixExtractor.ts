/**
 * Tarix archive extractor
 *
 * Extracts files from tarix.tgz archives used by Dash docsets.
 * Uses tarixIndex.db to locate files within the archive.
 */

import Database from 'better-sqlite3';
import { createReadStream, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import * as tar from 'tar-stream';

export class TarixExtractor {
  private tarixPath: string;
  private indexDb: Database.Database;
  private cache: Map<string, string> = new Map();

  constructor(tarixPath: string, indexDbPath: string) {
    if (!existsSync(tarixPath)) {
      throw new Error(`Tarix archive not found: ${tarixPath}`);
    }
    if (!existsSync(indexDbPath)) {
      throw new Error(`Tarix index not found: ${indexDbPath}`);
    }

    this.tarixPath = tarixPath;
    this.indexDb = new Database(indexDbPath, { readonly: true });
  }

  /**
   * Check if a file exists in the archive
   */
  hasFile(path: string): boolean {
    const row = this.indexDb.prepare(
      'SELECT hash FROM tarindex WHERE path = ?'
    ).get(path) as { hash: string } | undefined;

    return row !== undefined;
  }

  /**
   * Get all file paths in the archive
   */
  getFilePaths(): string[] {
    const rows = this.indexDb.prepare(
      'SELECT path FROM tarindex ORDER BY path'
    ).all() as Array<{ path: string }>;

    return rows.map(r => r.path);
  }

  /**
   * Get file paths matching a pattern
   */
  getFilePathsMatching(pattern: string): string[] {
    const rows = this.indexDb.prepare(
      'SELECT path FROM tarindex WHERE path LIKE ? ORDER BY path'
    ).all(pattern) as Array<{ path: string }>;

    return rows.map(r => r.path);
  }

  /**
   * Extract a file from the tarix archive
   */
  async extractFile(path: string): Promise<string> {
    // Check cache first
    if (this.cache.has(path)) {
      return this.cache.get(path)!;
    }

    // Look up in index
    const row = this.indexDb.prepare(
      'SELECT hash FROM tarindex WHERE path = ?'
    ).get(path) as { hash: string } | undefined;

    if (!row) {
      throw new Error(`File not found in tarix index: ${path}`);
    }

    // Extract from tar
    const content = await this.extractFromTar(path);

    // Cache result (limit cache size)
    if (this.cache.size > 1000) {
      // Clear oldest entries
      const keys = Array.from(this.cache.keys()).slice(0, 500);
      for (const key of keys) {
        this.cache.delete(key);
      }
    }
    this.cache.set(path, content);

    return content;
  }

  /**
   * Extract multiple files at once (more efficient for batch operations)
   */
  async extractFiles(paths: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const pathSet = new Set(paths);

    // Check cache first
    for (const path of paths) {
      if (this.cache.has(path)) {
        results.set(path, this.cache.get(path)!);
        pathSet.delete(path);
      }
    }

    if (pathSet.size === 0) {
      return results;
    }

    // Extract remaining from tar in single pass
    await this.extractMultipleFromTar(pathSet, results);

    // Update cache
    for (const [path, content] of results) {
      if (!this.cache.has(path)) {
        this.cache.set(path, content);
      }
    }

    return results;
  }

  private extractFromTar(targetPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const extract = tar.extract();
      let found = false;

      extract.on('entry', (header, stream, next) => {
        if (header.name === targetPath || header.name === './' + targetPath) {
          found = true;
          const chunks: Buffer[] = [];

          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            resolve(Buffer.concat(chunks).toString('utf-8'));
          });
          stream.on('error', reject);
        } else {
          stream.resume();
          next();
        }
      });

      extract.on('finish', () => {
        if (!found) {
          reject(new Error(`File not found in tar: ${targetPath}`));
        }
      });

      extract.on('error', reject);

      // Pipe through gunzip
      const readStream = createReadStream(this.tarixPath);
      const gunzip = createGunzip();

      readStream.pipe(gunzip).pipe(extract);
    });
  }

  private extractMultipleFromTar(
    targetPaths: Set<string>,
    results: Map<string, string>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const extract = tar.extract();
      let remaining = targetPaths.size;

      extract.on('entry', (header, stream, next) => {
        const name = header.name.startsWith('./') ? header.name.slice(2) : header.name;

        if (targetPaths.has(name) || targetPaths.has(header.name)) {
          const chunks: Buffer[] = [];

          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            const path = targetPaths.has(name) ? name : header.name;
            results.set(path, Buffer.concat(chunks).toString('utf-8'));
            remaining--;
            if (remaining === 0) {
              // We've found all files, close early
              extract.destroy();
            }
            next();
          });
          stream.on('error', reject);
        } else {
          stream.resume();
          next();
        }
      });

      extract.on('finish', () => {
        resolve();
      });

      extract.on('close', () => {
        resolve();
      });

      extract.on('error', (err: Error) => {
        // Ignore premature close errors when we've found all files
        if (err.message !== 'premature close') {
          reject(err);
        }
      });

      const readStream = createReadStream(this.tarixPath);
      const gunzip = createGunzip();

      readStream.pipe(gunzip).pipe(extract);
    });
  }

  /**
   * Clear the extraction cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number } {
    let size = 0;
    for (const content of this.cache.values()) {
      size += content.length;
    }
    return { size, entries: this.cache.size };
  }

  /**
   * Close the extractor and release resources
   */
  close(): void {
    this.indexDb.close();
    this.cache.clear();
  }
}
