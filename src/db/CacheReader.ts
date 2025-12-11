import Database from 'better-sqlite3';
import type { CacheRef } from '../parser/types.js';

export class CacheReader {
  private db: Database.Database;
  private getRefStmt: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true });
    this.getRefStmt = this.db.prepare(`
      SELECT uuid, data_id as dataId, offset, length
      FROM refs
      WHERE uuid = ?
    `);
  }

  /**
   * Get cache reference by UUID
   */
  getRef(uuid: string): CacheRef | null {
    const row = this.getRefStmt.get(uuid) as CacheRef | undefined;
    return row ?? null;
  }

  /**
   * Get multiple cache references by UUIDs
   */
  getRefs(uuids: string[]): Map<string, CacheRef> {
    const result = new Map<string, CacheRef>();

    for (const uuid of uuids) {
      const ref = this.getRef(uuid);
      if (ref) {
        result.set(uuid, ref);
      }
    }

    return result;
  }

  /**
   * Check if a UUID exists in the cache
   */
  hasRef(uuid: string): boolean {
    return this.getRef(uuid) !== null;
  }

  /**
   * Get all unique data_ids (for preloading fs files)
   */
  getDataIds(): number[] {
    const stmt = this.db.prepare('SELECT DISTINCT data_id FROM refs ORDER BY data_id');
    const rows = stmt.all() as Array<{ data_id: number }>;
    return rows.map(r => r.data_id);
  }

  /**
   * Get count of refs for a specific data_id
   */
  getRefCountForDataId(dataId: number): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM refs WHERE data_id = ?');
    const row = stmt.get(dataId) as { count: number };
    return row.count;
  }

  /**
   * Get metadata from the metadata table
   */
  getMetadata(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
    const row = stmt.get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  close(): void {
    this.db.close();
  }
}
