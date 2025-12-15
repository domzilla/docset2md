/**
 * @file schema.ts
 * @module search/schema
 * @author Dominic Rodemer
 * @created 2025-12-14
 * @license MIT
 *
 * @fileoverview SQL schema constants for the search index database.
 */

/**
 * SQL statement to create the main entries table.
 */
export const CREATE_ENTRIES_TABLE = `
CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        language TEXT,
        framework TEXT,
        path TEXT NOT NULL,
        abstract TEXT,
        declaration TEXT,
        deprecated INTEGER DEFAULT 0,
        beta INTEGER DEFAULT 0
)`;

/**
 * SQL statement to create the FTS5 virtual table for full-text search.
 * Uses content='entries' to reference the main table.
 */
export const CREATE_FTS_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
        name,
        type,
        framework,
        abstract,
        declaration,
        content='entries',
        content_rowid='id'
)`;

/**
 * SQL trigger to keep FTS index in sync after INSERT.
 */
export const CREATE_INSERT_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
        INSERT INTO entries_fts(rowid, name, type, framework, abstract, declaration)
        VALUES (new.id, new.name, new.type, new.framework, new.abstract, new.declaration);
END`;

/**
 * SQL trigger to keep FTS index in sync after DELETE.
 */
export const CREATE_DELETE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, name, type, framework, abstract, declaration)
        VALUES ('delete', old.id, old.name, old.type, old.framework, old.abstract, old.declaration);
END`;

/**
 * SQL trigger to keep FTS index in sync after UPDATE.
 */
export const CREATE_UPDATE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
        INSERT INTO entries_fts(entries_fts, rowid, name, type, framework, abstract, declaration)
        VALUES ('delete', old.id, old.name, old.type, old.framework, old.abstract, old.declaration);
        INSERT INTO entries_fts(rowid, name, type, framework, abstract, declaration)
        VALUES (new.id, new.name, new.type, new.framework, new.abstract, new.declaration);
END`;

/**
 * SQL statement to create index on type column.
 */
export const CREATE_TYPE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type)`;

/**
 * SQL statement to create index on framework column.
 */
export const CREATE_FRAMEWORK_INDEX = `
CREATE INDEX IF NOT EXISTS idx_entries_framework ON entries(framework)`;

/**
 * SQL statement to create index on language column.
 */
export const CREATE_LANGUAGE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_entries_language ON entries(language)`;

/**
 * SQL statement to insert an entry.
 */
export const INSERT_ENTRY = `
INSERT INTO entries (name, type, language, framework, path, abstract, declaration, deprecated, beta)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/**
 * All schema statements in order of execution.
 */
export const SCHEMA_STATEMENTS = [
    CREATE_ENTRIES_TABLE,
    CREATE_FTS_TABLE,
    CREATE_INSERT_TRIGGER,
    CREATE_DELETE_TRIGGER,
    CREATE_UPDATE_TRIGGER,
    CREATE_TYPE_INDEX,
    CREATE_FRAMEWORK_INDEX,
    CREATE_LANGUAGE_INDEX,
];
