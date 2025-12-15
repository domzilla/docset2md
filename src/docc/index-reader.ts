/**
 * @file IndexReader.ts
 * @module docc/IndexReader
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Reads searchIndex table from docSet.dsidx for documentation entries.
 */

import Database from 'better-sqlite3';
import type { IndexEntry } from './types.js';

/**
 * Options for filtering index queries.
 */
export interface IndexReaderOptions {
    /** Filter by entry types (Class, Method, etc.) */
    types?: string[];
    /** Filter by framework names */
    frameworks?: string[];
    /** Filter by programming language */
    languages?: Array<'swift' | 'objc'>;
    /** Maximum number of entries to return */
    limit?: number;
}

/**
 * Reads documentation entries from the docSet.dsidx SQLite database.
 *
 * The searchIndex table contains entries with:
 * - id: Row identifier
 * - name: Symbol name
 * - type: Entry type (Class, Method, Property, etc.)
 * - path: URL with request_key parameter for content lookup
 *
 * @example
 * ```typescript
 * const reader = new IndexReader('/path/to/docSet.dsidx');
 * const types = reader.getTypes();
 * for (const entry of reader.iterateEntries({ types: ['Class'] })) {
 *   console.log(entry.name);
 * }
 * reader.close();
 * ```
 */
export class IndexReader {
    private db: Database.Database;

    /**
     * Create a new IndexReader.
     * @param dbPath - Path to the docSet.dsidx SQLite database
     */
    constructor(dbPath: string) {
        this.db = new Database(dbPath, { readonly: true });
    }

    /**
     * Get all unique entry types in the index
     */
    getTypes(): string[] {
        const stmt = this.db.prepare('SELECT DISTINCT type FROM searchIndex ORDER BY type');
        const rows = stmt.all() as Array<{ type: string }>;
        return rows.map(r => r.type);
    }

    /**
     * Get all unique frameworks in the index
     */
    getFrameworks(): string[] {
        const stmt = this.db.prepare(`
            SELECT DISTINCT name FROM searchIndex
            WHERE type = 'Framework'
            ORDER BY name
        `);
        const rows = stmt.all() as Array<{ name: string }>;
        return rows.map(r => r.name);
    }

    /**
     * Get total count of entries
     */
    getCount(options?: IndexReaderOptions): number {
        const { where, params } = this.buildWhereClause(options);
        const sql = `SELECT COUNT(*) as count FROM searchIndex ${where}`;
        const row = this.db.prepare(sql).get(...params) as { count: number };
        return row.count;
    }

    /**
     * Get entries with optional filtering
     */
    getEntries(options?: IndexReaderOptions): IndexEntry[] {
        const { where, params } = this.buildWhereClause(options);
        let sql = `SELECT id, name, type, path FROM searchIndex ${where} ORDER BY type, name`;

        if (options?.limit) {
            sql += ` LIMIT ${options.limit}`;
        }

        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params) as Array<{
            id: number;
            name: string;
            type: string;
            path: string;
        }>;

        return rows
            .map(row => this.parseEntry(row))
            .filter((entry): entry is IndexEntry => entry !== null);
    }

    /**
     * Get entries by type
     */
    getEntriesByType(type: string, language?: 'swift' | 'objc'): IndexEntry[] {
        return this.getEntries({
            types: [type],
            languages: language ? [language] : undefined
        });
    }

    /**
     * Iterate over entries using a generator (memory efficient for large datasets).
     * Yields entries one at a time without loading all into memory.
     * @param options - Optional filtering options
     * @yields IndexEntry for each matching entry
     */
    *iterateEntries(options?: IndexReaderOptions): Generator<IndexEntry> {
        const { where, params } = this.buildWhereClause(options);
        const sql = `SELECT id, name, type, path FROM searchIndex ${where} ORDER BY type, name`;

        const stmt = this.db.prepare(sql);

        for (const row of stmt.iterate(...params) as Iterable<{
            id: number;
            name: string;
            type: string;
            path: string;
        }>) {
            const entry = this.parseEntry(row);
            if (entry) {
                yield entry;
            }
        }
    }

    /**
     * Build SQL WHERE clause from filter options.
     * @param options - Filter options
     * @returns Object with WHERE clause string and parameter values
     */
    private buildWhereClause(options?: IndexReaderOptions): { where: string; params: unknown[] } {
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (options?.types && options.types.length > 0) {
            const placeholders = options.types.map(() => '?').join(', ');
            conditions.push(`type IN (${placeholders})`);
            params.push(...options.types);
        }

        if (options?.languages && options.languages.length > 0) {
            const langConditions: string[] = [];
            for (const lang of options.languages) {
                const prefix = lang === 'swift' ? 'ls/' : 'lc/';
                langConditions.push(`path LIKE ?`);
                params.push(`%request_key=${prefix}%`);
            }
            conditions.push(`(${langConditions.join(' OR ')})`);
        }

        if (options?.frameworks && options.frameworks.length > 0) {
            const frameworkConditions: string[] = [];
            for (const fw of options.frameworks) {
                frameworkConditions.push(`path LIKE ?`);
                params.push(`%/documentation/${fw.toLowerCase()}%`);
            }
            conditions.push(`(${frameworkConditions.join(' OR ')})`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        return { where, params };
    }

    /**
     * Parse a database row into an IndexEntry.
     * Extracts the request key and language from the path URL.
     * @param row - Database row with id, name, type, path
     * @returns Parsed IndexEntry or null if path format is invalid
     */
    private parseEntry(row: { id: number; name: string; type: string; path: string }): IndexEntry | null {
        // Parse the path to extract request_key and language
        // Format: dash-apple-api://load?request_key=ls/documentation/...#<metadata>
        const match = row.path.match(/request_key=(l[sc]\/[^#]+)/);
        if (!match) {
            return null;
        }

        const requestKey = decodeURIComponent(match[1]);
        const language = requestKey.startsWith('ls/') ? 'swift' : 'objc';

        return {
            id: row.id,
            name: row.name,
            type: row.type,
            path: row.path,
            requestKey,
            language,
        };
    }

    /**
     * Build a map of documentation paths to their available languages.
     *
     * This is used for cross-language link resolution: when a Swift document
     * links to a type that only exists in Objective-C (or vice versa), we need
     * to know which languages each documentation path is available in.
     *
     * @returns Map from normalized doc path to set of available languages
     *
     * @example
     * ```typescript
     * const langMap = reader.buildLanguageAvailabilityMap();
     * const langs = langMap.get('/documentation/os/os_object');
     * // Set { 'objc' } - only available in Objective-C
     * ```
     */
    buildLanguageAvailabilityMap(): Map<string, Set<'swift' | 'objc'>> {
        const map = new Map<string, Set<'swift' | 'objc'>>();

        const stmt = this.db.prepare('SELECT path FROM searchIndex');
        for (const row of stmt.iterate() as Iterable<{ path: string }>) {
            // Parse the path to extract request_key
            // Format: dash-apple-api://load?request_key=ls/documentation/...#<metadata>
            const match = row.path.match(/request_key=(l[sc]\/documentation\/[^#]+)/);
            if (!match) continue;

            const requestKey = decodeURIComponent(match[1]);
            const language: 'swift' | 'objc' = requestKey.startsWith('ls/') ? 'swift' : 'objc';

            // Normalize to just the documentation path (without language prefix)
            // ls/documentation/uikit/uiwindow -> /documentation/uikit/uiwindow
            const docPath = '/' + requestKey.substring(3); // Remove 'ls/' or 'lc/'

            const existing = map.get(docPath);
            if (existing) {
                existing.add(language);
            } else {
                map.set(docPath, new Set([language]));
            }
        }

        return map;
    }

    /**
     * Close the database connection.
     * Should be called when done reading to release resources.
     */
    close(): void {
        this.db.close();
    }
}
