import Database from 'better-sqlite3';
import type { IndexEntry } from '../parser/types.js';

export interface IndexReaderOptions {
  types?: string[];
  frameworks?: string[];
  languages?: Array<'swift' | 'objc'>;
  limit?: number;
}

export class IndexReader {
  private db: Database.Database;

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
   * Iterate over all entries (memory efficient for large datasets)
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

  close(): void {
    this.db.close();
  }
}
