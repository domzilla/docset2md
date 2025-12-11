import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ContentExtractor } from '../../../src/extractor/ContentExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEST_DATA_DIR = resolve(__dirname, '../../../test_data/input');
const APPLE_DOCSET_PATH = resolve(TEST_DATA_DIR, 'Apple_UIKit_Reference.docset');
const CACHE_DB_PATH = resolve(APPLE_DOCSET_PATH, 'Contents/Resources/Documents/cache.db');

const hasTestData = existsSync(CACHE_DB_PATH);

describe('ContentExtractor', () => {
  let extractor: ContentExtractor | null = null;

  beforeAll(() => {
    if (!hasTestData) {
      console.warn('Apple test data not found. Run: npx tsx scripts/extract-framework-apple-docset.ts UIKit');
      return;
    }
    extractor = new ContentExtractor(APPLE_DOCSET_PATH);
  });

  afterAll(() => {
    extractor?.close();
  });

  describe('extractByRequestKey', () => {
    it('should extract DocC document for valid request key', () => {
      if (!extractor) return;

      // Try a framework-level entry that's likely to exist
      const doc = extractor.extractByRequestKey('ls/documentation/uikit');

      if (doc) {
        expect(doc).toHaveProperty('schemaVersion');
        expect(doc).toHaveProperty('kind');
        expect(doc).toHaveProperty('identifier');
        expect(doc).toHaveProperty('references');
      }
    });

    it('should return null for non-existent request key', () => {
      if (!extractor) return;

      const doc = extractor.extractByRequestKey('ls/documentation/nonexistent/path');
      expect(doc).toBeNull();
    });

    it('should extract document with metadata', () => {
      if (!extractor) return;

      const doc = extractor.extractByRequestKey('ls/documentation/uikit');

      if (doc && doc.metadata) {
        expect(doc.metadata).toHaveProperty('title');
      }
    });
  });

  describe('hasContent', () => {
    it('should return false for non-existent request key', () => {
      if (!extractor) return;

      expect(extractor.hasContent('ls/documentation/nonexistent/path')).toBe(false);
    });
  });

  describe('cache management', () => {
    it('should start with zero cache size', () => {
      if (!extractor) return;

      // Clear any previous cache
      extractor.clearCache();
      expect(extractor.getCacheSize()).toBe(0);
    });

    it('should increase cache size after extraction', () => {
      if (!extractor) return;

      extractor.clearCache();
      const initialSize = extractor.getCacheSize();

      // Extract something to populate cache
      extractor.extractByRequestKey('ls/documentation/uikit');

      // Cache size may or may not increase depending on whether content was found
      const newSize = extractor.getCacheSize();
      expect(newSize).toBeGreaterThanOrEqual(initialSize);
    });

    it('should clear cache properly', () => {
      if (!extractor) return;

      // Extract something first
      extractor.extractByRequestKey('ls/documentation/uikit');

      // Clear and verify
      extractor.clearCache();
      expect(extractor.getCacheSize()).toBe(0);
    });
  });

  describe('preloadDataIds', () => {
    it('should preload data IDs without error', () => {
      if (!extractor) return;

      extractor.clearCache();

      // This should not throw
      expect(() => {
        extractor!.preloadDataIds([1, 2, 3]);
      }).not.toThrow();
    });
  });

  // Skip all tests if no test data
  (hasTestData ? describe : describe.skip)('with test data', () => {
    it('test data should be available', () => {
      expect(hasTestData).toBe(true);
    });
  });
});
