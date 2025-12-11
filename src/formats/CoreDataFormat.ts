/**
 * CoreData format handler
 *
 * Handles docsets with CoreData schema:
 * - ZTOKEN, ZNODE, ZTOKENTYPE tables in docSet.dsidx
 * - HTML files in tarix.tgz archive
 */

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DocsetFormat,
  NormalizedEntry,
  ParsedContent,
  EntryFilters,
} from './types.js';
import { TarixExtractor } from '../extractor/TarixExtractor.js';
import { HtmlParser } from '../parser/HtmlParser.js';

export class CoreDataFormat implements DocsetFormat {
  private docsetPath: string = '';
  private db: Database.Database | null = null;
  private tarix: TarixExtractor | null = null;
  private htmlParser: HtmlParser = new HtmlParser();
  private docsetName: string = '';
  private initialized = false;

  getName(): string {
    return 'CoreData';
  }

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

  async initialize(docsetPath: string): Promise<void> {
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

  isInitialized(): boolean {
    return this.initialized;
  }

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
        type: this.normalizeType(row.type),
        path: this.cleanPath(row.path),
      };
    }
  }

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

  getTypes(): string[] {
    if (!this.db) return [];

    const rows = this.db.prepare(
      'SELECT DISTINCT ZTYPENAME FROM ZTOKENTYPE ORDER BY ZTYPENAME'
    ).all() as Array<{ ZTYPENAME: string }>;

    return rows.map(r => this.normalizeType(r.ZTYPENAME));
  }

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

  supportsMultipleLanguages(): boolean {
    return false;
  }

  getLanguages(): string[] {
    return [];
  }

  close(): void {
    this.db?.close();
    this.tarix?.close();
    this.initialized = false;
  }

  private buildWhereClause(filters?: EntryFilters): {
    conditions: string[];
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters?.types?.length) {
      const placeholders = filters.types.map(() => '?').join(',');
      conditions.push(`tt.ZTYPENAME IN (${placeholders})`);
      params.push(...filters.types.map(t => this.denormalizeType(t)));
    }

    return { conditions, params };
  }

  /**
   * Clean path from CoreData format
   * Paths may have dash_entry metadata embedded
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

  /**
   * Normalize type names
   */
  private normalizeType(type: string): string {
    const typeMap: Record<string, string> = {
      'func': 'Function',
      'macro': 'Macro',
      'tdef': 'Type',
      'Struct': 'Struct',
      'Enum': 'Enum',
      'clconst': 'Constant',
      'File': 'File',
      'Keyword': 'Keyword',
      'Attribute': 'Attribute',
      'Guide': 'Guide',
    };

    return typeMap[type] || type;
  }

  /**
   * Denormalize type for query
   */
  private denormalizeType(type: string): string {
    const reverseMap: Record<string, string> = {
      'Function': 'func',
      'Macro': 'macro',
      'Type': 'tdef',
      'Constant': 'clconst',
    };

    return reverseMap[type] || type;
  }
}
