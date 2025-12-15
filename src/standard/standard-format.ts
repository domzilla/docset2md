/**
 * @file StandardFormat.ts
 * @module standard/StandardFormat
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Handler for generic Dash/Kapeli docsets with HTML content.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import type {
    DocsetFormat,
    NormalizedEntry,
    ParsedContent,
    EntryFilters,
    FormatInitOptions,
    LinkMapping,
} from '../shared/formats/types.js';
import { sanitizeFileName } from '../shared/utils/sanitize.js';
import { TarixExtractor } from '../shared/tarix-extractor.js';
import { HtmlParser } from '../shared/html-parser.js';
import { normalizeType, denormalizeTypes } from '../shared/utils/type-normalizer.js';

/**
 * Format handler for standard Dash/Kapeli docsets.
 *
 * Standard docsets use a simpler format:
 * 1. Index entries stored in searchIndex table (id, name, type, path)
 * 2. HTML content stored either in Documents/ folder or tarix.tgz archive
 * 3. No language variants or complex cache system
 *
 * @implements {DocsetFormat}
 *
 * @example
 * ```typescript
 * const format = new StandardFormat();
 * if (await format.detect('./PHP.docset')) {
 *   await format.initialize('./PHP.docset');
 *   for (const entry of format.iterateEntries({ types: ['Function'] })) {
 *     const content = await format.extractContent(entry);
 *     // Process content...
 *   }
 *   format.close();
 * }
 * ```
 */
export class StandardFormat implements DocsetFormat {
    private docsetPath: string = '';
    private db: Database.Database | null = null;
    private tarix: TarixExtractor | null = null;
    private htmlParser: HtmlParser = new HtmlParser();
    private docsetName: string = '';
    private initialized = false;
    private linkMap: Map<string, LinkMapping> | null = null;

    /** @inheritdoc */
    getName(): string {
        return 'Standard Dash';
    }

    /**
     * Detect if a docset is in Standard Dash format.
     *
     * Standard Dash format is identified by:
     * - Has searchIndex table in docSet.dsidx
     * - Does NOT have CoreData tables (ZTOKEN)
     * - Does NOT have Apple's cache.db
     *
     * @param docsetPath - Path to the .docset directory
     * @returns true if this is a Standard Dash docset
     */
    async detect(docsetPath: string): Promise<boolean> {
        const indexPath = join(docsetPath, 'Contents/Resources/docSet.dsidx');
        if (!existsSync(indexPath)) return false;

        // Must have searchIndex table but NOT be Apple format (no cache.db)
        // and NOT be CoreData format (no ZTOKEN table)
        try {
            const db = new Database(indexPath, { readonly: true });
            const tables = db
                .prepare("SELECT name FROM sqlite_master WHERE type='table'")
                .all() as Array<{ name: string }>;
            const tableNames = tables.map(t => t.name);
            db.close();

            // Must have searchIndex
            if (!tableNames.includes('searchIndex')) return false;

            // Must NOT have CoreData tables
            if (tableNames.includes('ZTOKEN')) return false;

            // Must NOT have Apple's cache.db
            const cacheDbPath = join(docsetPath, 'Contents/Resources/Documents/cache.db');
            if (existsSync(cacheDbPath)) return false;

            return true;
        } catch {
            return false;
        }
    }

    /** @inheritdoc */
    async initialize(docsetPath: string, _options?: FormatInitOptions): Promise<void> {
        this.docsetPath = docsetPath;
        this.docsetName = docsetPath.split('/').pop()?.replace('.docset', '') || 'Docset';

        const indexPath = join(docsetPath, 'Contents/Resources/docSet.dsidx');
        this.db = new Database(indexPath, { readonly: true });

        // Initialize tarix extractor if available
        const tarixPath = join(docsetPath, 'Contents/Resources/tarix.tgz');
        const tarixIndexPath = join(docsetPath, 'Contents/Resources/tarixIndex.db');

        if (existsSync(tarixPath) && existsSync(tarixIndexPath)) {
            this.tarix = new TarixExtractor(tarixPath, tarixIndexPath);
        }

        this.initialized = true;
    }

    /** @inheritdoc */
    isInitialized(): boolean {
        return this.initialized;
    }

    /** @inheritdoc */
    getEntryCount(filters?: EntryFilters): number {
        if (!this.db) throw new Error('Not initialized');

        let sql = 'SELECT COUNT(*) as count FROM searchIndex';
        const { conditions, params } = this.buildWhereClause(filters);

        if (conditions.length) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        const row = this.db.prepare(sql).get(...params) as { count: number };
        return row.count;
    }

    /** @inheritdoc */
    *iterateEntries(filters?: EntryFilters): Generator<NormalizedEntry> {
        if (!this.db) throw new Error('Not initialized');

        let sql = 'SELECT id, name, type, path FROM searchIndex';
        const { conditions, params } = this.buildWhereClause(filters);

        if (conditions.length) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }

        sql += ' ORDER BY type, name';

        if (filters?.limit) {
            sql += ` LIMIT ${filters.limit}`;
        }

        const stmt = this.db.prepare(sql);

        for (const row of stmt.iterate(...params) as Iterable<{
            id: number;
            name: string;
            type: string;
            path: string;
        }>) {
            yield {
                id: row.id,
                name: row.name,
                type: normalizeType(row.type),
                path: row.path,
            };
        }
    }

    /** @inheritdoc */
    async extractContent(entry: NormalizedEntry): Promise<ParsedContent | null> {
        const htmlPath = this.resolveContentPath(entry.path);
        if (!htmlPath) return null;

        let html: string | null = null;

        // Try tarix first
        if (this.tarix) {
            // Build full path in tarix (includes docset structure)
            const tarixPath = `${this.docsetName}.docset/Contents/Resources/Documents/${htmlPath}`;
            try {
                html = await this.tarix.extractFile(tarixPath);
            } catch {
                // Try without docset prefix
                try {
                    html = await this.tarix.extractFile(htmlPath);
                } catch {
                    // File might not be in tarix, try documents folder
                }
            }
        }

        // Fall back to Documents directory
        if (!html) {
            const docPath = join(this.docsetPath, 'Contents/Resources/Documents', htmlPath);
            if (existsSync(docPath)) {
                html = readFileSync(docPath, 'utf-8');
            }
        }

        if (!html) return null;

        // Set link context for internal link resolution
        if (this.linkMap) {
            const currentTypeDir = entry.type.toLowerCase();
            this.htmlParser.setLinkContext(this.linkMap, currentTypeDir);
        }

        return this.htmlParser.parse(html, entry.name, entry.type);
    }

    /** @inheritdoc */
    getTypes(): string[] {
        if (!this.db) return [];

        const rows = this.db
            .prepare('SELECT DISTINCT type FROM searchIndex ORDER BY type')
            .all() as Array<{ type: string }>;

        return rows.map(r => normalizeType(r.type));
    }

    /** @inheritdoc */
    getCategories(): string[] {
        // Standard Dash format doesn't have framework concept
        // Could extract from path patterns if needed
        return [];
    }

    /** @inheritdoc */
    supportsMultipleLanguages(): boolean {
        return false;
    }

    /** @inheritdoc */
    getLanguages(): string[] {
        return [];
    }

    /** @inheritdoc */
    close(): void {
        this.db?.close();
        this.tarix?.close();
        this.initialized = false;
    }

    /**
     * Set the link mapping for internal link resolution.
     *
     * Call this with the result of buildLinkMapping() before extracting content
     * to enable internal .html links to be converted to .md links.
     *
     * @param linkMap - Map from HTML filenames to output paths
     */
    setLinkMapping(linkMap: Map<string, LinkMapping>): void {
        this.linkMap = linkMap;
    }

    /**
     * Build a mapping from HTML filenames to output markdown paths.
     *
     * This mapping is used to convert internal .html links in the content
     * to their corresponding .md output paths.
     *
     * @returns Map from HTML filename (e.g., "class.iteratoraggregate.html") to LinkMapping
     *
     * @example
     * ```typescript
     * const linkMap = format.buildLinkMapping();
     * // linkMap.get("class.iteratoraggregate.html")
     * // => { outputPath: "interface/iteratoraggregate.md", type: "Interface", name: "IteratorAggregate" }
     * ```
     */
    buildLinkMapping(): Map<string, LinkMapping> {
        if (!this.db) throw new Error('Not initialized');

        const linkMap = new Map<string, LinkMapping>();

        const stmt = this.db.prepare('SELECT name, type, path FROM searchIndex');

        for (const row of stmt.iterate() as Iterable<{
            name: string;
            type: string;
            path: string;
        }>) {
            // Extract the HTML filename from the path
            // Path formats: "www.php.net/manual/en/class.iteratoraggregate.html" or just "class.iteratoraggregate.html"
            const pathWithoutFragment = row.path.split('#')[0];
            const htmlFilename = pathWithoutFragment.split('/').pop() || pathWithoutFragment;

            // Normalize the type and build output path
            const normalizedType = normalizeType(row.type);
            const typeDir = normalizedType.toLowerCase();
            const sanitizedName = sanitizeFileName(row.name);
            const outputPath = `${typeDir}/${sanitizedName}.md`;

            linkMap.set(htmlFilename, {
                outputPath,
                type: normalizedType,
                name: row.name,
            });
        }

        return linkMap;
    }

    /**
     * Build SQL WHERE clause from filters.
     * @param filters - Entry filters to convert
     * @returns Object with conditions array and params array
     */
    private buildWhereClause(filters?: EntryFilters): {
        conditions: string[];
        params: unknown[];
    } {
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (filters?.types?.length) {
            // Map normalized types back to potential original types
            const originalTypes = filters.types.flatMap(t => denormalizeTypes(t));
            const placeholders = originalTypes.map(() => '?').join(',');
            conditions.push(`type IN (${placeholders})`);
            params.push(...originalTypes);
        }

        return { conditions, params };
    }

    /**
     * Resolve entry path to content file path.
     *
     * Handles various path formats including full URLs, relative paths,
     * paths with anchors, and Dash metadata tags.
     *
     * @param path - Raw path from searchIndex
     * @returns Resolved path or null if invalid
     */
    private resolveContentPath(path: string): string | null {
        // Handle various path formats

        // Strip Dash metadata tags like <dash_entry_name=...><dash_entry_originalName=...>
        // These appear as prefixes before the actual path
        let cleanPath = path;
        if (cleanPath.startsWith('<dash_entry_')) {
            // Find the last > that precedes the actual path
            const lastTagEnd = cleanPath.lastIndexOf('>');
            if (lastTagEnd !== -1) {
                cleanPath = cleanPath.substring(lastTagEnd + 1);
            }
        }

        // Remove fragment
        const withoutFragment = cleanPath.split('#')[0];

        // Handle full URLs
        if (withoutFragment.startsWith('http://') || withoutFragment.startsWith('https://')) {
            // Extract path from URL
            try {
                const url = new URL(withoutFragment);
                return (
                    this.docsetName +
                    '.docset/Contents/Resources/Documents/' +
                    url.host +
                    url.pathname
                );
            } catch {
                return null;
            }
        }

        // Handle relative paths
        if (withoutFragment.includes('://')) {
            return null; // Unknown protocol
        }

        // Check if path already includes docset structure
        if (withoutFragment.includes('/Contents/Resources/Documents/')) {
            return withoutFragment;
        }

        // Assume it's a relative path in Documents
        return withoutFragment;
    }
}
