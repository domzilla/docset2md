/**
 * @file SearchIndexWriter.ts
 * @module search/SearchIndexWriter
 * @author Dominic Rodemer
 * @created 2025-12-14
 * @license MIT
 *
 * @fileoverview Creates and populates the search index database during conversion.
 */

import Database from 'better-sqlite3';
import type { SearchEntry } from './types.js';
import { SCHEMA_STATEMENTS, INSERT_ENTRY } from './schema.js';

/**
 * Default batch size for committing inserts.
 */
const DEFAULT_BATCH_SIZE = 1000;

/**
 * Writes documentation entries to a SQLite search index with FTS5 support.
 *
 * The index is created at the root of the output directory as `search.db`.
 * Uses FTS5 for full-text search with BM25 ranking.
 *
 * @example
 * ```typescript
 * const writer = new SearchIndexWriter('/output/search.db');
 * writer.addEntry({
 *   name: 'UIWindow',
 *   type: 'Class',
 *   language: 'swift',
 *   framework: 'UIKit',
 *   path: 'swift/uikit/uiwindow.md',
 *   abstract: 'A window that contains the visual content of an app.'
 * });
 * writer.close();
 * ```
 */
export class SearchIndexWriter {
    private db: Database.Database;
    private insertStmt: Database.Statement;
    private pendingCount: number = 0;
    private batchSize: number;
    private totalEntries: number = 0;

    /**
     * Create a new SearchIndexWriter.
     * @param dbPath - Path where the search.db file will be created
     * @param batchSize - Number of entries to batch before committing (default: 1000)
     */
    constructor(dbPath: string, batchSize: number = DEFAULT_BATCH_SIZE) {
        this.batchSize = batchSize;
        this.db = new Database(dbPath);

        // Enable WAL mode for better write performance
        this.db.pragma('journal_mode = WAL');

        // Initialize schema
        this.initializeSchema();

        // Prepare insert statement
        this.insertStmt = this.db.prepare(INSERT_ENTRY);

        // Start transaction for batching
        this.db.exec('BEGIN TRANSACTION');
    }

    /**
     * Initialize the database schema with all tables and indexes.
     */
    private initializeSchema(): void {
        for (const stmt of SCHEMA_STATEMENTS) {
            this.db.exec(stmt);
        }
    }

    /**
     * Add an entry to the search index.
     * Entries are batched for performance and committed periodically.
     * @param entry - The entry to add
     */
    addEntry(entry: SearchEntry): void {
        this.insertStmt.run(
            entry.name,
            entry.type,
            entry.language ?? null,
            entry.framework ?? null,
            entry.path,
            entry.abstract ?? null,
            entry.declaration ?? null,
            entry.deprecated ? 1 : 0,
            entry.beta ? 1 : 0
        );

        this.pendingCount++;
        this.totalEntries++;

        // Commit batch if threshold reached
        if (this.pendingCount >= this.batchSize) {
            this.commitBatch();
        }
    }

    /**
     * Commit pending entries and start a new transaction.
     */
    private commitBatch(): void {
        if (this.pendingCount > 0) {
            this.db.exec('COMMIT');
            this.db.exec('BEGIN TRANSACTION');
            this.pendingCount = 0;
        }
    }

    /**
     * Get the total number of entries added.
     */
    getEntryCount(): number {
        return this.totalEntries;
    }

    /**
     * Close the database connection.
     * Commits any pending entries and optimizes the database.
     */
    close(): void {
        // Commit any pending transaction
        try {
            this.db.exec('COMMIT');
        } catch {
            // Transaction may already be committed
        }

        // Optimize FTS index
        if (this.totalEntries > 0) {
            this.db.exec("INSERT INTO entries_fts(entries_fts) VALUES('optimize')");
        }

        // Return to normal journal mode (must be outside transaction)
        this.db.pragma('journal_mode = DELETE');

        // Vacuum to reclaim space
        this.db.exec('VACUUM');

        this.db.close();
    }
}
