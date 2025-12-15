/**
 * @file SearchIndexReader.ts
 * @module search-cli/SearchIndexReader
 * @author Dominic Rodemer
 * @created 2025-12-14
 * @license MIT
 *
 * @fileoverview Reads and queries the search index database using bun:sqlite.
 */

import { Database } from 'bun:sqlite';

/**
 * Search entry from the database.
 */
export interface SearchEntry {
    id: number;
    name: string;
    type: string;
    language: string | null;
    framework: string | null;
    path: string;
    abstract: string | null;
    declaration: string | null;
    deprecated: boolean;
    beta: boolean;
}

/**
 * Search result with relevance score.
 */
export interface SearchResult extends SearchEntry {
    score: number;
}

/**
 * Options for filtering search results.
 */
export interface SearchOptions {
    type?: string;
    framework?: string;
    language?: string;
    limit?: number;
    offset?: number;
}

/**
 * BM25 ranking weights for FTS5 columns.
 * Higher values = more important in ranking.
 */
const BM25_WEIGHTS = {
    name: 10.0, // Symbol name is most important
    type: 5.0, // Entry type
    framework: 2.0, // Framework name
    abstract: 1.0, // Description
    declaration: 1.0, // Code signature
};

/**
 * Escape a query string for safe use with FTS5 MATCH.
 *
 * FTS5 has its own query syntax with keywords (AND, OR, NOT, NEAR) and
 * special characters (*, ", :, etc.). This function escapes user input
 * by quoting individual tokens while preserving intentional wildcards.
 *
 * Behavior:
 * - Simple terms are quoted: `NSURL` → `"NSURL"`
 * - Prefix wildcards are preserved: `bookmark*` → `"bookmark"*`
 * - User-quoted phrases are preserved: `"exact phrase"` → `"exact phrase"`
 * - Keywords become literals: `view and controller` → `"view" "and" "controller"`
 *
 * @param query - Raw user query string
 * @returns Escaped query safe for FTS5 MATCH
 *
 * @example
 * escapeForFts5('NSURL bookmark*')
 * // Returns: "NSURL" "bookmark"*
 *
 * @example
 * escapeForFts5('Support In-App Purchases and interactions')
 * // Returns: "Support" "In-App" "Purchases" "and" "interactions"
 *
 * @example
 * escapeForFts5('"exact phrase" other*')
 * // Returns: "exact phrase" "other"*
 */
function escapeForFts5(query: string): string {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;

    // Tokenize: split on whitespace, but keep quoted phrases together
    while (i < query.length) {
        const char = query[i];

        if (char === '"') {
            if (inQuotes) {
                // End of quoted phrase
                current += char;
                tokens.push(current);
                current = '';
                inQuotes = false;
            } else {
                // Start of quoted phrase
                if (current.trim()) {
                    tokens.push(current.trim());
                }
                current = char;
                inQuotes = true;
            }
            i++;
        } else if (/\s/.test(char) && !inQuotes) {
            // Whitespace outside quotes - end of token
            if (current.trim()) {
                tokens.push(current.trim());
            }
            current = '';
            i++;
        } else {
            current += char;
            i++;
        }
    }

    // Don't forget the last token
    if (current.trim()) {
        tokens.push(current.trim());
    }

    // Process each token
    const escaped = tokens.map(token => {
        // Already quoted by user - preserve as-is (but escape internal quotes)
        if (token.startsWith('"') && token.endsWith('"')) {
            const inner = token.slice(1, -1);
            // Escape any internal double quotes
            return `"${inner.replace(/"/g, '""')}"`;
        }

        // Check for wildcard suffix
        const hasWildcard = token.endsWith('*');
        const base = hasWildcard ? token.slice(0, -1) : token;

        // Skip empty tokens
        if (!base) {
            return hasWildcard ? '*' : '';
        }

        // Escape internal double quotes and wrap in quotes
        const quotedBase = `"${base.replace(/"/g, '""')}"`;

        // Put wildcard outside quotes if present
        return hasWildcard ? `${quotedBase}*` : quotedBase;
    });

    return escaped.filter(t => t).join(' ');
}

/**
 * Reads and queries a search index database created by SearchIndexWriter.
 *
 * Uses FTS5 full-text search with BM25 ranking for relevance scoring.
 *
 * @example
 * ```typescript
 * const reader = new SearchIndexReader('./output/search.db');
 * const results = reader.search('UIWindow');
 * for (const result of results) {
 *   console.log(`${result.name} (${result.type}) - ${result.score}`);
 * }
 * reader.close();
 * ```
 */
export class SearchIndexReader {
    private db: Database;

    /**
     * Create a new SearchIndexReader.
     * @param dbPath - Path to the search.db file
     */
    constructor(dbPath: string) {
        this.db = new Database(dbPath, { readonly: true });
    }

    /**
     * Search for entries matching the query.
     *
     * @param query - Search query (supports FTS5 syntax: prefix*, "exact phrase", AND/OR/NOT)
     * @param options - Filter options
     * @returns Array of search results sorted by relevance
     */
    search(query: string, options: SearchOptions = {}): SearchResult[] {
        const limit = options.limit ?? 20;
        const offset = options.offset ?? 0;

        // Build filter conditions
        const conditions: string[] = [];
        const params: (string | number)[] = [];

        // FTS5 match condition with escaped query
        conditions.push('entries_fts MATCH ?');
        params.push(escapeForFts5(query));

        // Optional filters
        if (options.type) {
            conditions.push('e.type = ?');
            params.push(options.type);
        }
        if (options.framework) {
            conditions.push('e.framework = ?');
            params.push(options.framework);
        }
        if (options.language) {
            conditions.push('e.language = ?');
            params.push(options.language);
        }

        // BM25 weights for ranking
        const weights = `${BM25_WEIGHTS.name}, ${BM25_WEIGHTS.type}, ${BM25_WEIGHTS.framework}, ${BM25_WEIGHTS.abstract}, ${BM25_WEIGHTS.declaration}`;

        const sql = `
            SELECT e.*,
                          bm25(entries_fts, ${weights}) as score
            FROM entries e
            JOIN entries_fts ON e.id = entries_fts.rowid
            WHERE ${conditions.join(' AND ')}
            ORDER BY score
            LIMIT ? OFFSET ?
        `;

        params.push(limit, offset);

        const stmt = this.db.prepare(sql);
        const rows = stmt.all(...params) as Array<{
            id: number;
            name: string;
            type: string;
            language: string | null;
            framework: string | null;
            path: string;
            abstract: string | null;
            declaration: string | null;
            deprecated: number;
            beta: number;
            score: number;
        }>;

        return rows.map(row => ({
            id: row.id,
            name: row.name,
            type: row.type,
            language: row.language,
            framework: row.framework,
            path: row.path,
            abstract: row.abstract,
            declaration: row.declaration,
            deprecated: row.deprecated === 1,
            beta: row.beta === 1,
            score: Math.abs(row.score), // BM25 returns negative scores
        }));
    }

    /**
     * Get entry by ID.
     * @param id - Entry ID
     * @returns Entry or null if not found
     */
    getEntry(id: number): SearchEntry | null {
        const stmt = this.db.prepare('SELECT * FROM entries WHERE id = ?');
        const row = stmt.get(id) as {
            id: number;
            name: string;
            type: string;
            language: string | null;
            framework: string | null;
            path: string;
            abstract: string | null;
            declaration: string | null;
            deprecated: number;
            beta: number;
        } | null;

        if (!row) return null;

        return {
            id: row.id,
            name: row.name,
            type: row.type,
            language: row.language,
            framework: row.framework,
            path: row.path,
            abstract: row.abstract,
            declaration: row.declaration,
            deprecated: row.deprecated === 1,
            beta: row.beta === 1,
        };
    }

    /**
     * Get all unique entry types.
     * @returns Array of type names with counts
     */
    getTypes(): Array<{ type: string; count: number }> {
        const stmt = this.db.prepare(`
            SELECT type, COUNT(*) as count
            FROM entries
            GROUP BY type
            ORDER BY count DESC
        `);
        return stmt.all() as Array<{ type: string; count: number }>;
    }

    /**
     * Get all unique frameworks.
     * @returns Array of framework names with counts
     */
    getFrameworks(): Array<{ framework: string; count: number }> {
        const stmt = this.db.prepare(`
            SELECT framework, COUNT(*) as count
            FROM entries
            WHERE framework IS NOT NULL
            GROUP BY framework
            ORDER BY count DESC
        `);
        return stmt.all() as Array<{ framework: string; count: number }>;
    }

    /**
     * Get all unique languages.
     * @returns Array of language names with counts
     */
    getLanguages(): Array<{ language: string; count: number }> {
        const stmt = this.db.prepare(`
            SELECT language, COUNT(*) as count
            FROM entries
            WHERE language IS NOT NULL
            GROUP BY language
            ORDER BY count DESC
        `);
        return stmt.all() as Array<{ language: string; count: number }>;
    }

    /**
     * Get total entry count.
     * @returns Total number of entries in the index
     */
    getCount(): number {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM entries');
        const row = stmt.get() as { count: number };
        return row.count;
    }

    /**
     * Close the database connection.
     */
    close(): void {
        this.db.close();
    }
}
