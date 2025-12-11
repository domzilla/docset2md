/**
 * @file IndexReader.test.ts
 * @module tests/unit/db/IndexReader
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Unit tests for IndexReader searchIndex operations.
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IndexReader } from '../../../src/db/IndexReader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DATA_DIR = resolve(__dirname, '../../../test_data/input');
const APPLE_DOCSET_PATH = resolve(TEST_DATA_DIR, 'Apple_UIKit_Reference.docset');
const INDEX_PATH = resolve(APPLE_DOCSET_PATH, 'Contents/Resources/docSet.dsidx');

const hasTestData = existsSync(INDEX_PATH);

describe('IndexReader', () => {
  let indexReader: IndexReader | null = null;

  beforeAll(() => {
    if (!hasTestData) {
      console.warn('Apple test data not found. Run: npx tsx scripts/extract-framework-apple-docset.ts UIKit');
      return;
    }
    indexReader = new IndexReader(INDEX_PATH);
  });

  afterAll(() => {
    indexReader?.close();
  });

  describe('getTypes', () => {
    it('should return all unique entry types', () => {
      if (!indexReader) return;

      const types = indexReader.getTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      // Common Apple docset types
      expect(types).toEqual(expect.arrayContaining(['Class', 'Method', 'Property']));
    });

    it('should return sorted types', () => {
      if (!indexReader) return;

      const types = indexReader.getTypes();
      const sorted = [...types].sort();
      expect(types).toEqual(sorted);
    });
  });

  describe('getFrameworks', () => {
    it('should return UIKit for UIKit docset', () => {
      if (!indexReader) return;

      const frameworks = indexReader.getFrameworks();
      expect(frameworks).toContain('UIKit');
    });
  });

  describe('getCount', () => {
    it('should return total count without filters', () => {
      if (!indexReader) return;

      const count = indexReader.getCount();
      expect(count).toBeGreaterThan(0);
    });

    it('should filter by type', () => {
      if (!indexReader) return;

      const classCount = indexReader.getCount({ types: ['Class'] });
      const totalCount = indexReader.getCount();
      expect(classCount).toBeGreaterThan(0);
      expect(classCount).toBeLessThan(totalCount);
    });

    it('should filter by multiple types', () => {
      if (!indexReader) return;

      const classCount = indexReader.getCount({ types: ['Class'] });
      const protocolCount = indexReader.getCount({ types: ['Protocol'] });
      const bothCount = indexReader.getCount({ types: ['Class', 'Protocol'] });
      expect(bothCount).toBe(classCount + protocolCount);
    });

    it('should filter by language', () => {
      if (!indexReader) return;

      const swiftCount = indexReader.getCount({ languages: ['swift'] });
      const objcCount = indexReader.getCount({ languages: ['objc'] });
      const bothCount = indexReader.getCount();
      // Sum may be less than total due to duplicates
      expect(swiftCount).toBeGreaterThan(0);
      expect(objcCount).toBeGreaterThan(0);
    });

    it('should return 0 for non-existent type', () => {
      if (!indexReader) return;

      const count = indexReader.getCount({ types: ['NonExistentType'] });
      expect(count).toBe(0);
    });
  });

  describe('getEntries', () => {
    it('should return entries array', () => {
      if (!indexReader) return;

      const entries = indexReader.getEntries({ limit: 10 });
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeLessThanOrEqual(10);
    });

    it('should return entries with required properties', () => {
      if (!indexReader) return;

      const entries = indexReader.getEntries({ limit: 1 });
      expect(entries.length).toBe(1);

      const entry = entries[0];
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('type');
      expect(entry).toHaveProperty('path');
      expect(entry).toHaveProperty('requestKey');
      expect(entry).toHaveProperty('language');
    });

    it('should correctly parse language from request key', () => {
      if (!indexReader) return;

      const swiftEntries = indexReader.getEntries({ languages: ['swift'], limit: 5 });
      const objcEntries = indexReader.getEntries({ languages: ['objc'], limit: 5 });

      for (const entry of swiftEntries) {
        expect(entry.language).toBe('swift');
        expect(entry.requestKey.startsWith('ls/')).toBe(true);
      }

      for (const entry of objcEntries) {
        expect(entry.language).toBe('objc');
        expect(entry.requestKey.startsWith('lc/')).toBe(true);
      }
    });
  });

  describe('getEntriesByType', () => {
    it('should return entries filtered by type', () => {
      if (!indexReader) return;

      const classEntries = indexReader.getEntriesByType('Class');
      expect(classEntries.length).toBeGreaterThan(0);

      for (const entry of classEntries) {
        expect(entry.type).toBe('Class');
      }
    });

    it('should filter by both type and language', () => {
      if (!indexReader) return;

      const swiftClasses = indexReader.getEntriesByType('Class', 'swift');
      for (const entry of swiftClasses) {
        expect(entry.type).toBe('Class');
        expect(entry.language).toBe('swift');
      }
    });
  });

  describe('iterateEntries', () => {
    it('should yield entries one at a time', () => {
      if (!indexReader) return;

      let count = 0;
      for (const entry of indexReader.iterateEntries({ limit: 100 })) {
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('name');
        expect(entry).toHaveProperty('requestKey');
        count++;
        if (count >= 10) break;
      }

      expect(count).toBe(10);
    });

    it('should filter entries during iteration', () => {
      if (!indexReader) return;

      for (const entry of indexReader.iterateEntries({ types: ['Class'], limit: 50 })) {
        expect(entry.type).toBe('Class');
      }
    });
  });

  // Skip all tests if no test data
  (hasTestData ? describe : describe.skip)('with test data', () => {
    it('test data should be available', () => {
      expect(hasTestData).toBe(true);
    });
  });
});
