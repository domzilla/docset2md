/**
 * @file CacheReader.ts
 * @module docc/CacheReader
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Reads cache.db to map UUIDs to content locations in Apple DocC docsets.
 */

import Database from 'better-sqlite3';
import type { CacheRef } from './types.js';

/**
 * Reads cache references from the cache.db SQLite database.
 *
 * The refs table maps UUIDs to content locations:
 * - uuid: Generated from SHA-1 hash of canonical path
 * - data_id: ID of the file in fs/ directory
 * - offset: Byte offset in decompressed data
 * - length: Length of JSON content
 *
 * @example
 * ```typescript
 * const reader = new CacheReader('/path/to/cache.db');
 * const ref = reader.getRef('lsXYZ123...');
 * if (ref) {
 *   console.log(`Data in fs/${ref.dataId} at offset ${ref.offset}`);
 * }
 * reader.close();
 * ```
 */
export class CacheReader {
    private db: Database.Database;
    private getRefStmt: Database.Statement;

    /**
     * Create a new CacheReader.
     * @param dbPath - Path to the cache.db SQLite database
     */
    constructor(dbPath: string) {
        this.db = new Database(dbPath, { readonly: true });
        this.getRefStmt = this.db.prepare(`
            SELECT uuid, data_id as dataId, offset, length
            FROM refs
            WHERE uuid = ?
        `);
    }

    /**
     * Get cache reference by UUID.
     * @param uuid - The UUID generated from a request key
     * @returns CacheRef with location info, or null if not found
     */
    getRef(uuid: string): CacheRef | null {
        const row = this.getRefStmt.get(uuid) as CacheRef | undefined;
        return row ?? null;
    }

    /**
     * Get multiple cache references by UUIDs.
     * @param uuids - Array of UUIDs to look up
     * @returns Map from UUID to CacheRef (missing UUIDs are omitted)
     */
    getRefs(uuids: string[]): Map<string, CacheRef> {
        const result = new Map<string, CacheRef>();

        for (const uuid of uuids) {
            const ref = this.getRef(uuid);
            if (ref) {
                result.set(uuid, ref);
            }
        }

        return result;
    }

    /**
     * Check if a UUID exists in the cache.
     * @param uuid - The UUID to check
     * @returns true if the UUID has a cache entry
     */
    hasRef(uuid: string): boolean {
        return this.getRef(uuid) !== null;
    }

    /**
     * Get all unique data_ids (for preloading fs files).
     * @returns Array of data file IDs used in the cache
     */
    getDataIds(): number[] {
        const stmt = this.db.prepare('SELECT DISTINCT data_id FROM refs ORDER BY data_id');
        const rows = stmt.all() as Array<{ data_id: number }>;
        return rows.map(r => r.data_id);
    }

    /**
     * Get count of refs for a specific data_id.
     * Useful for determining how many entries are in each fs file.
     * @param dataId - The data file ID
     * @returns Number of cache entries referencing this data file
     */
    getRefCountForDataId(dataId: number): number {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM refs WHERE data_id = ?');
        const row = stmt.get(dataId) as { count: number };
        return row.count;
    }

    /**
     * Get metadata from the metadata table.
     * @param key - Metadata key to look up
     * @returns Metadata value or null if not found
     */
    getMetadata(key: string): string | null {
        const stmt = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
        const row = stmt.get(key) as { value: string } | undefined;
        return row?.value ?? null;
    }

    /**
     * Close the database connection.
     * Should be called when done reading to release resources.
     */
    close(): void {
        this.db.close();
    }
}
