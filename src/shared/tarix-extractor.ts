/**
 * @file TarixExtractor.ts
 * @module shared/TarixExtractor
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Extracts files from tarix.tgz archives used by Dash docsets.
 */

import Database from 'better-sqlite3';
import { createReadStream, existsSync } from 'node:fs';
import { createGunzip } from 'node:zlib';
import * as tar from 'tar-stream';

/**
 * Extracts files from tarix.tgz archives.
 *
 * Tarix is Dash's indexed tar format that allows efficient random access
 * to files within a gzipped tar archive. The tarixIndex.db file contains
 * a hash-based index of file paths and their locations.
 *
 * Extracted files are cached in memory for repeated access.
 *
 * @example
 * ```typescript
 * const extractor = new TarixExtractor(
 *   '/path/to/tarix.tgz',
 *   '/path/to/tarixIndex.db'
 * );
 * const html = await extractor.extractFile('www.php.net/manual/en/function.array-map.html');
 * extractor.close();
 * ```
 */
export class TarixExtractor {
    private tarixPath: string;
    private indexDb: Database.Database;
    private cache: Map<string, string> = new Map();

    /**
     * Create a new TarixExtractor.
     * @param tarixPath - Path to the tarix.tgz archive
     * @param indexDbPath - Path to the tarixIndex.db SQLite database
     * @throws Error if either file does not exist
     */
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
     * Check if a file exists in the archive.
     * @param path - File path to check
     * @returns true if the file exists in the tarix index
     */
    hasFile(path: string): boolean {
        const row = this.indexDb.prepare(
            'SELECT hash FROM tarindex WHERE path = ?'
        ).get(path) as { hash: string } | undefined;

        return row !== undefined;
    }

    /**
     * Get all file paths in the archive.
     * @returns Array of all file paths in the index
     */
    getFilePaths(): string[] {
        const rows = this.indexDb.prepare(
            'SELECT path FROM tarindex ORDER BY path'
        ).all() as Array<{ path: string }>;

        return rows.map(r => r.path);
    }

    /**
     * Get file paths matching a SQL LIKE pattern.
     * @param pattern - SQL LIKE pattern (e.g., "%.html")
     * @returns Array of matching file paths
     */
    getFilePathsMatching(pattern: string): string[] {
        const rows = this.indexDb.prepare(
            'SELECT path FROM tarindex WHERE path LIKE ? ORDER BY path'
        ).all(pattern) as Array<{ path: string }>;

        return rows.map(r => r.path);
    }

    /**
     * Extract a file from the tarix archive.
     * Results are cached for subsequent calls.
     * @param path - File path within the archive
     * @returns File content as a string
     * @throws Error if file is not found in the index or archive
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
     * Extract multiple files at once (more efficient for batch operations).
     * Reads the archive in a single pass for all requested files.
     * @param paths - Array of file paths to extract
     * @returns Map from file path to content
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

    /**
     * Extract a single file from the tar archive.
     * @param targetPath - Path of the file to extract
     * @returns Promise resolving to file content
     */
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

    /**
     * Extract multiple files from the tar archive in a single pass.
     * @param targetPaths - Set of paths to extract
     * @param results - Map to populate with extracted content
     * @returns Promise that resolves when extraction is complete
     */
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
     * Clear the extraction cache to free memory.
     */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get cache statistics.
     * @returns Object with total size in bytes and number of entries
     */
    getCacheStats(): { size: number; entries: number } {
        let size = 0;
        for (const content of this.cache.values()) {
            size += content.length;
        }
        return { size, entries: this.cache.size };
    }

    /**
     * Close the extractor and release resources.
     * Closes the index database and clears the cache.
     */
    close(): void {
        this.indexDb.close();
        this.cache.clear();
    }
}
