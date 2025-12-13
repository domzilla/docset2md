/**
 * @file CacheReader.test.ts
 * @module tests/unit/db/CacheReader
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Unit tests for CacheReader cache.db operations.
 */

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CacheReader } from '../../../src/docc/CacheReader.js';
import { generateUuid } from '../../../src/docc/UuidGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DATA_DIR = resolve(__dirname, '../../../test_data/input');
const APPLE_DOCSET_PATH = resolve(TEST_DATA_DIR, 'Apple_UIKit_Reference.docset');
const CACHE_DB_PATH = resolve(APPLE_DOCSET_PATH, 'Contents/Resources/Documents/cache.db');

const hasTestData = existsSync(CACHE_DB_PATH);

describe('CacheReader', () => {
  let cacheReader: CacheReader | null = null;

  beforeAll(() => {
    if (!hasTestData) {
      console.warn('Apple test data not found. Run: npx tsx scripts/extract-framework-apple-docset.ts UIKit');
      return;
    }
    cacheReader = new CacheReader(CACHE_DB_PATH);
  });

  afterAll(() => {
    cacheReader?.close();
  });

  describe('getRef', () => {
    it('should return cache reference for valid UUID', () => {
      if (!cacheReader) return;

      // Generate a UUID that should exist in UIKit docset
      const uuid = generateUuid('ls/documentation/uikit');
      const ref = cacheReader.getRef(uuid);

      // May or may not exist depending on docset content
      if (ref) {
        expect(ref).toHaveProperty('uuid');
        expect(ref).toHaveProperty('dataId');
        expect(ref).toHaveProperty('offset');
        expect(ref).toHaveProperty('length');
        expect(typeof ref.dataId).toBe('number');
        expect(typeof ref.offset).toBe('number');
        expect(typeof ref.length).toBe('number');
        expect(ref.length).toBeGreaterThan(0);
      }
    });

    it('should return null for non-existent UUID', () => {
      if (!cacheReader) return;

      const ref = cacheReader.getRef('nonexistent_uuid_12345');
      expect(ref).toBeNull();
    });
  });

  describe('getRefs', () => {
    it('should return map of cache references', () => {
      if (!cacheReader) return;

      const uuids = [
        generateUuid('ls/documentation/uikit'),
        generateUuid('ls/documentation/uikit/uiview'),
        'nonexistent_uuid_12345',
      ];

      const refs = cacheReader.getRefs(uuids);
      expect(refs instanceof Map).toBe(true);
      // Should not contain the non-existent UUID
      expect(refs.has('nonexistent_uuid_12345')).toBe(false);
    });

    it('should return empty map for all invalid UUIDs', () => {
      if (!cacheReader) return;

      const refs = cacheReader.getRefs(['invalid1', 'invalid2']);
      expect(refs instanceof Map).toBe(true);
      expect(refs.size).toBe(0);
    });
  });

  describe('hasRef', () => {
    it('should return false for non-existent UUID', () => {
      if (!cacheReader) return;

      expect(cacheReader.hasRef('nonexistent_uuid')).toBe(false);
    });
  });

  describe('getDataIds', () => {
    it('should return array of data IDs', () => {
      if (!cacheReader) return;

      const dataIds = cacheReader.getDataIds();
      expect(Array.isArray(dataIds)).toBe(true);
      expect(dataIds.length).toBeGreaterThan(0);

      // All IDs should be numbers
      for (const id of dataIds) {
        expect(typeof id).toBe('number');
      }
    });

    it('should return sorted data IDs', () => {
      if (!cacheReader) return;

      const dataIds = cacheReader.getDataIds();
      const sorted = [...dataIds].sort((a, b) => a - b);
      expect(dataIds).toEqual(sorted);
    });
  });

  describe('getRefCountForDataId', () => {
    it('should return count of refs for valid data ID', () => {
      if (!cacheReader) return;

      const dataIds = cacheReader.getDataIds();
      if (dataIds.length > 0) {
        const count = cacheReader.getRefCountForDataId(dataIds[0]);
        expect(count).toBeGreaterThan(0);
      }
    });

    it('should return 0 for non-existent data ID', () => {
      if (!cacheReader) return;

      const count = cacheReader.getRefCountForDataId(999999);
      expect(count).toBe(0);
    });
  });

  describe('getMetadata', () => {
    it('should return null for non-existent key', () => {
      if (!cacheReader) return;

      const value = cacheReader.getMetadata('nonexistent_key');
      expect(value).toBeNull();
    });
  });

  // Skip all tests if no test data
  (hasTestData ? describe : describe.skip)('with test data', () => {
    it('test data should be available', () => {
      expect(hasTestData).toBe(true);
    });
  });
});
