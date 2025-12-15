/**
 * @file SearchIndexWriter.test.ts
 * @module tests/unit/search/SearchIndexWriter
 * @author Dominic Rodemer
 * @created 2025-12-14
 * @license MIT
 *
 * @fileoverview Unit tests for SearchIndexWriter.
 */

import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { SearchIndexWriter } from '../../../src/search/search-index-writer.js';

describe('SearchIndexWriter', () => {
    const testDir = join(process.cwd(), 'test_data', 'output', 'search_test');
    const testDbPath = join(testDir, 'test_search.db');

    beforeAll(() => {
        // Ensure test directory exists
        if (!existsSync(testDir)) {
            mkdirSync(testDir, { recursive: true });
        }
    });

    beforeEach(() => {
        // Clean up any existing test database
        if (existsSync(testDbPath)) {
            unlinkSync(testDbPath);
        }
    });

    afterAll(() => {
        // Cleanup
        if (existsSync(testDbPath)) {
            unlinkSync(testDbPath);
        }
    });

    describe('constructor', () => {
        it('should create database file', () => {
            const writer = new SearchIndexWriter(testDbPath);
            writer.close();
            expect(existsSync(testDbPath)).toBe(true);
        });

        it('should create required tables', () => {
            const writer = new SearchIndexWriter(testDbPath);
            writer.close();

            const db = new Database(testDbPath, { readonly: true });
            const tables = db
                .prepare(
                    `
                                SELECT name FROM sqlite_master
                                WHERE type='table'
                                ORDER BY name
                        `
                )
                .all() as Array<{ name: string }>;
            db.close();

            const tableNames = tables.map(t => t.name);
            expect(tableNames).toContain('entries');
            expect(tableNames).toContain('entries_fts');
        });

        it('should create indexes', () => {
            const writer = new SearchIndexWriter(testDbPath);
            writer.close();

            const db = new Database(testDbPath, { readonly: true });
            const indexes = db
                .prepare(
                    `
                                SELECT name FROM sqlite_master
                                WHERE type='index' AND name LIKE 'idx_%'
                        `
                )
                .all() as Array<{ name: string }>;
            db.close();

            const indexNames = indexes.map(i => i.name);
            expect(indexNames).toContain('idx_entries_type');
            expect(indexNames).toContain('idx_entries_framework');
            expect(indexNames).toContain('idx_entries_language');
        });
    });

    describe('addEntry', () => {
        it('should add entry to database', () => {
            const writer = new SearchIndexWriter(testDbPath);
            writer.addEntry({
                name: 'UIWindow',
                type: 'Class',
                language: 'swift',
                framework: 'UIKit',
                path: 'swift/uikit/uiwindow.md',
                abstract: 'A window that contains the visual content of an app.',
                declaration: 'class UIWindow : UIView',
                deprecated: false,
                beta: false,
            });
            writer.close();

            const db = new Database(testDbPath, { readonly: true });
            const row = db.prepare('SELECT * FROM entries WHERE name = ?').get('UIWindow') as {
                name: string;
                type: string;
                language: string;
                framework: string;
                path: string;
                abstract: string;
            };
            db.close();

            expect(row).toBeDefined();
            expect(row.name).toBe('UIWindow');
            expect(row.type).toBe('Class');
            expect(row.language).toBe('swift');
            expect(row.framework).toBe('UIKit');
        });

        it('should handle entries without optional fields', () => {
            const writer = new SearchIndexWriter(testDbPath);
            writer.addEntry({
                name: 'array_map',
                type: 'Function',
                path: 'function/array_map.md',
            });
            writer.close();

            const db = new Database(testDbPath, { readonly: true });
            const row = db.prepare('SELECT * FROM entries WHERE name = ?').get('array_map') as {
                name: string;
                language: string | null;
                framework: string | null;
            };
            db.close();

            expect(row).toBeDefined();
            expect(row.name).toBe('array_map');
            expect(row.language).toBeNull();
            expect(row.framework).toBeNull();
        });

        it('should track entry count', () => {
            const writer = new SearchIndexWriter(testDbPath);

            expect(writer.getEntryCount()).toBe(0);

            writer.addEntry({ name: 'Test1', type: 'Class', path: 'test1.md' });
            expect(writer.getEntryCount()).toBe(1);

            writer.addEntry({ name: 'Test2', type: 'Method', path: 'test2.md' });
            expect(writer.getEntryCount()).toBe(2);

            writer.close();
        });

        it('should handle deprecated and beta flags', () => {
            const writer = new SearchIndexWriter(testDbPath);
            writer.addEntry({
                name: 'OldClass',
                type: 'Class',
                path: 'oldclass.md',
                deprecated: true,
                beta: false,
            });
            writer.addEntry({
                name: 'NewClass',
                type: 'Class',
                path: 'newclass.md',
                deprecated: false,
                beta: true,
            });
            writer.close();

            const db = new Database(testDbPath, { readonly: true });
            const oldRow = db
                .prepare('SELECT deprecated, beta FROM entries WHERE name = ?')
                .get('OldClass') as {
                deprecated: number;
                beta: number;
            };
            const newRow = db
                .prepare('SELECT deprecated, beta FROM entries WHERE name = ?')
                .get('NewClass') as {
                deprecated: number;
                beta: number;
            };
            db.close();

            expect(oldRow.deprecated).toBe(1);
            expect(oldRow.beta).toBe(0);
            expect(newRow.deprecated).toBe(0);
            expect(newRow.beta).toBe(1);
        });
    });

    describe('FTS5 indexing', () => {
        it('should populate FTS table via trigger', () => {
            const writer = new SearchIndexWriter(testDbPath);
            writer.addEntry({
                name: 'UIViewController',
                type: 'Class',
                framework: 'UIKit',
                path: 'swift/uikit/uiviewcontroller.md',
                abstract: 'An object that manages a view hierarchy.',
            });
            writer.close();

            const db = new Database(testDbPath, { readonly: true });
            // Query FTS table directly
            const ftsRow = db
                .prepare(
                    `
                                SELECT * FROM entries_fts WHERE entries_fts MATCH 'UIViewController'
                        `
                )
                .get();
            db.close();

            expect(ftsRow).toBeDefined();
        });

        it('should support prefix search', () => {
            const writer = new SearchIndexWriter(testDbPath);
            writer.addEntry({ name: 'UIWindow', type: 'Class', path: 'uiwindow.md' });
            writer.addEntry({ name: 'UIView', type: 'Class', path: 'uiview.md' });
            writer.addEntry({
                name: 'UIViewController',
                type: 'Class',
                path: 'uiviewcontroller.md',
            });
            writer.addEntry({ name: 'NSWindow', type: 'Class', path: 'nswindow.md' });
            writer.close();

            const db = new Database(testDbPath, { readonly: true });
            const results = db
                .prepare(
                    `
                                SELECT e.name FROM entries e
                                JOIN entries_fts ON e.id = entries_fts.rowid
                                WHERE entries_fts MATCH 'UI*'
                        `
                )
                .all() as Array<{ name: string }>;
            db.close();

            expect(results.length).toBe(3);
            expect(results.map(r => r.name)).toContain('UIWindow');
            expect(results.map(r => r.name)).toContain('UIView');
            expect(results.map(r => r.name)).toContain('UIViewController');
        });

        it('should support full-text search in abstract', () => {
            const writer = new SearchIndexWriter(testDbPath);
            writer.addEntry({
                name: 'UIWindow',
                type: 'Class',
                path: 'uiwindow.md',
                abstract: 'A window that contains the visual content of an app.',
            });
            writer.addEntry({
                name: 'UIView',
                type: 'Class',
                path: 'uiview.md',
                abstract: 'An object that manages the content for a rectangular area.',
            });
            writer.close();

            const db = new Database(testDbPath, { readonly: true });
            const results = db
                .prepare(
                    `
                                SELECT e.name FROM entries e
                                JOIN entries_fts ON e.id = entries_fts.rowid
                                WHERE entries_fts MATCH 'visual content'
                        `
                )
                .all() as Array<{ name: string }>;
            db.close();

            expect(results.length).toBe(1);
            expect(results[0].name).toBe('UIWindow');
        });
    });

    describe('batch performance', () => {
        it('should handle many entries efficiently', () => {
            const writer = new SearchIndexWriter(testDbPath, 100); // Smaller batch for testing

            // Add 500 entries
            for (let i = 0; i < 500; i++) {
                writer.addEntry({
                    name: `TestEntry${i}`,
                    type: i % 2 === 0 ? 'Class' : 'Method',
                    path: `test/entry${i}.md`,
                });
            }
            writer.close();

            const db = new Database(testDbPath, { readonly: true });
            const count = db.prepare('SELECT COUNT(*) as count FROM entries').get() as {
                count: number;
            };
            db.close();

            expect(count.count).toBe(500);
        });
    });
});
