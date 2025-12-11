/**
 * Standard Dash format handler
 *
 * Handles generic Dash/Kapeli docsets with:
 * - Simple searchIndex table in docSet.dsidx
 * - HTML files in Documents/ or tarix.tgz archive
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

export class StandardDashFormat implements DocsetFormat {
  private docsetPath: string = '';
  private db: Database.Database | null = null;
  private tarix: TarixExtractor | null = null;
  private htmlParser: HtmlParser = new HtmlParser();
  private docsetName: string = '';
  private initialized = false;

  getName(): string {
    return 'Standard Dash';
  }

  async detect(docsetPath: string): Promise<boolean> {
    const indexPath = join(docsetPath, 'Contents/Resources/docSet.dsidx');
    if (!existsSync(indexPath)) return false;

    // Must have searchIndex table but NOT be Apple format (no cache.db)
    // and NOT be CoreData format (no ZTOKEN table)
    try {
      const db = new Database(indexPath, { readonly: true });
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
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

  async initialize(docsetPath: string): Promise<void> {
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

  isInitialized(): boolean {
    return this.initialized;
  }

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
        type: this.normalizeType(row.type),
        path: row.path,
      };
    }
  }

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

    return this.htmlParser.parse(html, entry.name, entry.type);
  }

  getTypes(): string[] {
    if (!this.db) return [];

    const rows = this.db.prepare(
      'SELECT DISTINCT type FROM searchIndex ORDER BY type'
    ).all() as Array<{ type: string }>;

    return rows.map(r => this.normalizeType(r.type));
  }

  getCategories(): string[] {
    // Standard Dash format doesn't have framework concept
    // Could extract from path patterns if needed
    return [];
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
      // Map normalized types back to potential original types
      const originalTypes = filters.types.flatMap(t => this.denormalizeType(t));
      const placeholders = originalTypes.map(() => '?').join(',');
      conditions.push(`type IN (${placeholders})`);
      params.push(...originalTypes);
    }

    return { conditions, params };
  }

  private resolveContentPath(path: string): string | null {
    // Handle various path formats

    // Remove fragment
    const withoutFragment = path.split('#')[0];

    // Handle full URLs
    if (withoutFragment.startsWith('http://') || withoutFragment.startsWith('https://')) {
      // Extract path from URL
      try {
        const url = new URL(withoutFragment);
        return this.docsetName + '.docset/Contents/Resources/Documents/' + url.host + url.pathname;
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

  /**
   * Normalize type names to standard format
   */
  private normalizeType(type: string): string {
    // Map common short forms to full names
    const typeMap: Record<string, string> = {
      'func': 'Function',
      'cl': 'Class',
      'clm': 'Method',
      'clconst': 'Constant',
      'tdef': 'Type',
      'macro': 'Macro',
      'cat': 'Category',
      'instm': 'Method',
      'instp': 'Property',
      'intf': 'Interface',
      'struct': 'Struct',
      'enum': 'Enum',
      'union': 'Union',
      'var': 'Variable',
      'const': 'Constant',
    };

    const lower = type.toLowerCase();
    return typeMap[lower] || type;
  }

  /**
   * Convert normalized type back to possible original forms
   */
  private denormalizeType(type: string): string[] {
    const reverseMap: Record<string, string[]> = {
      'Function': ['Function', 'func'],
      'Class': ['Class', 'cl'],
      'Method': ['Method', 'clm', 'instm'],
      'Constant': ['Constant', 'clconst', 'const'],
      'Type': ['Type', 'tdef'],
      'Macro': ['Macro', 'macro'],
      'Category': ['Category', 'cat'],
      'Property': ['Property', 'instp'],
      'Interface': ['Interface', 'intf'],
      'Struct': ['Struct', 'struct'],
      'Enum': ['Enum', 'enum'],
      'Union': ['Union', 'union'],
      'Variable': ['Variable', 'var'],
    };

    return reverseMap[type] || [type];
  }
}
