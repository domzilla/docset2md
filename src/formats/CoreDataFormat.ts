/**
 * @file CoreDataFormat.ts
 * @module formats/CoreDataFormat
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Handler for CoreData-based docsets with ZTOKEN/ZNODE tables.
 */

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DocsetFormat,
  NormalizedEntry,
  ParsedContent,
  EntryFilters,
  FormatInitOptions,
} from './types.js';
import { TarixExtractor } from '../extractor/TarixExtractor.js';
import { HtmlParser } from '../parser/HtmlParser.js';
import { normalizeType, denormalizeType } from '../utils/typeNormalizer.js';

/**
 * Format handler for CoreData-based docsets.
 *
 * CoreData docsets use a more complex schema:
 * 1. Tokens stored in ZTOKEN table with type references to ZTOKENTYPE
 * 2. Node hierarchy in ZNODE table
 * 3. File paths via ZTOKENMETAINFORMATION -> ZFILEPATH join
 * 4. HTML content in tarix.tgz archive
 *
 * @implements {DocsetFormat}
 *
 * @example
 * ```typescript
 * const format = new CoreDataFormat();
 * if (await format.detect('./C.docset')) {
 *   await format.initialize('./C.docset');
 *   for (const entry of format.iterateEntries({ types: ['Function'] })) {
 *     const content = await format.extractContent(entry);
 *     // Process content...
 *   }
 *   format.close();
 * }
 * ```
 */
export class CoreDataFormat implements DocsetFormat {
  private docsetPath: string = '';
  private db: Database.Database | null = null;
  private tarix: TarixExtractor | null = null;
  private htmlParser: HtmlParser = new HtmlParser();
  private docsetName: string = '';
  private initialized = false;

  /** @inheritdoc */
  getName(): string {
    return 'CoreData';
  }

  /**
   * Detect if a docset is in CoreData format.
   *
   * CoreData format is identified by the presence of ZTOKEN and ZNODE
   * tables in the docSet.dsidx SQLite database.
   *
   * @param docsetPath - Path to the .docset directory
   * @returns true if this is a CoreData docset
   */
  async detect(docsetPath: string): Promise<boolean> {
    const indexPath = join(docsetPath, 'Contents/Resources/docSet.dsidx');
    if (!existsSync(indexPath)) return false;

    try {
      const db = new Database(indexPath, { readonly: true });
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
      const tableNames = tables.map(t => t.name);
      db.close();

      // CoreData format has ZTOKEN and ZNODE tables
      return tableNames.includes('ZTOKEN') && tableNames.includes('ZNODE');
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

    // Initialize tarix extractor
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

    let sql = `
      SELECT COUNT(*) as count
      FROM ZTOKEN t
      JOIN ZTOKENTYPE tt ON t.ZTOKENTYPE = tt.Z_PK
    `;

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

    let sql = `
      SELECT
        t.Z_PK as id,
        t.ZTOKENNAME as name,
        tt.ZTYPENAME as type,
        f.ZPATH as path
      FROM ZTOKEN t
      JOIN ZTOKENTYPE tt ON t.ZTOKENTYPE = tt.Z_PK
      LEFT JOIN ZTOKENMETAINFORMATION m ON t.Z_PK = m.ZTOKEN
      LEFT JOIN ZFILEPATH f ON m.ZFILE = f.Z_PK
    `;

    const { conditions, params } = this.buildWhereClause(filters);

    if (conditions.length) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY tt.ZTYPENAME, t.ZTOKENNAME';

    if (filters?.limit) {
      sql += ` LIMIT ${filters.limit}`;
    }

    const stmt = this.db.prepare(sql);

    for (const row of stmt.iterate(...params) as Iterable<{
      id: number;
      name: string;
      type: string;
      path: string | null;
    }>) {
      // Skip entries without paths
      if (!row.path) continue;

      yield {
        id: row.id,
        name: row.name,
        type: normalizeType(row.type),
        path: this.cleanPath(row.path),
      };
    }
  }

  /** @inheritdoc */
  async extractContent(entry: NormalizedEntry): Promise<ParsedContent | null> {
    let html: string | null = null;

    // Build full path in tarix
    const tarixPath = `${this.docsetName}.docset/Contents/Resources/Documents/${entry.path}`;

    if (this.tarix) {
      try {
        html = await this.tarix.extractFile(tarixPath);
      } catch {
        // Try without docset prefix
        try {
          html = await this.tarix.extractFile(entry.path);
        } catch {
          // File not in tarix
        }
      }
    }

    // Fall back to Documents directory
    if (!html) {
      const docPath = join(this.docsetPath, 'Contents/Resources/Documents', entry.path);
      if (existsSync(docPath)) {
        html = readFileSync(docPath, 'utf-8');
      }
    }

    if (!html) return null;

    return this.htmlParser.parse(html, entry.name, entry.type);
  }

  /** @inheritdoc */
  getTypes(): string[] {
    if (!this.db) return [];

    const rows = this.db.prepare(
      'SELECT DISTINCT ZTYPENAME FROM ZTOKENTYPE ORDER BY ZTYPENAME'
    ).all() as Array<{ ZTYPENAME: string }>;

    return rows.map(r => normalizeType(r.ZTYPENAME));
  }

  /** @inheritdoc */
  getCategories(): string[] {
    // Could extract from ZNODE hierarchy
    if (!this.db) return [];

    // Try to get top-level nodes
    const rows = this.db.prepare(`
      SELECT DISTINCT ZKNAME as name
      FROM ZNODE
      WHERE ZKNAME IS NOT NULL
      ORDER BY ZKNAME
    `).all() as Array<{ name: string }>;

    return rows.map(r => r.name).filter(n => n && n.length > 0);
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
      const placeholders = filters.types.map(() => '?').join(',');
      conditions.push(`tt.ZTYPENAME IN (${placeholders})`);
      params.push(...filters.types.map(t => denormalizeType(t)));
    }

    return { conditions, params };
  }

  /**
   * Clean path from CoreData format.
   *
   * CoreData paths may have dash_entry metadata embedded like
   * `<dash_entry_name=foo>actual/path.html`. This extracts the actual path.
   *
   * @param path - Raw path from ZFILEPATH table
   * @returns Cleaned file path
   */
  private cleanPath(path: string): string {
    // Remove dash_entry metadata: <dash_entry_name=...>actual/path.html
    if (path.includes('<dash_entry')) {
      const match = path.match(/>([^<]+)$/);
      if (match) {
        return match[1];
      }
    }

    // Remove HTML anchors for path lookup
    return path.split('#')[0];
  }
}
