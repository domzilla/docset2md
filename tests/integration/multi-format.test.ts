/**
 * Integration tests for multi-format docset support
 */

import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormatRegistry } from '../../src/formats/FormatRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DATA_DIR = join(__dirname, '../../test_data/input');
const OUTPUT_DIR = join(__dirname, '../../test_data/output/integration');

// Test docset paths
const APPLE_DOCSET = join(TEST_DATA_DIR, 'Apple_UIKit_Reference.docset');
const PHP_DOCSET = join(TEST_DATA_DIR, 'PHP.docset');
const C_DOCSET = join(TEST_DATA_DIR, 'C.docset');

describe('Multi-Format Support', () => {
  let registry: FormatRegistry;

  beforeAll(() => {
    registry = new FormatRegistry();
    // Clean up output directory
    if (existsSync(OUTPUT_DIR)) {
      rmSync(OUTPUT_DIR, { recursive: true });
    }
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  describe('Format Detection', () => {
    it('should detect Apple DocC format', async () => {
      if (!existsSync(APPLE_DOCSET)) {
        console.warn('Skipping: Apple_UIKit_Reference.docset not found');
        return;
      }

      const format = await registry.detectFormat(APPLE_DOCSET);
      expect(format).not.toBeNull();
      expect(format!.getName()).toBe('Apple DocC');
    });

    it('should detect Standard Dash format (PHP)', async () => {
      if (!existsSync(PHP_DOCSET)) {
        console.warn('Skipping: PHP.docset not found');
        return;
      }

      const format = await registry.detectFormat(PHP_DOCSET);
      expect(format).not.toBeNull();
      expect(format!.getName()).toBe('Standard Dash');
    });

    it('should detect CoreData format (C)', async () => {
      if (!existsSync(C_DOCSET)) {
        console.warn('Skipping: C.docset not found');
        return;
      }

      const format = await registry.detectFormat(C_DOCSET);
      expect(format).not.toBeNull();
      expect(format!.getName()).toBe('CoreData');
    });

    it('should return null for non-existent path', async () => {
      const format = await registry.detectFormat('/nonexistent/path.docset');
      expect(format).toBeNull();
    });
  });

  describe('Apple DocC Format', () => {
    beforeAll(async () => {
      if (!existsSync(APPLE_DOCSET)) {
        console.warn('Apple_UIKit_Reference.docset not found. Run: npx tsx scripts/extract-framework-apple-docset.ts UIKit');
      }
    });

    it('should initialize and get entry count', async () => {
      if (!existsSync(APPLE_DOCSET)) return;

      const format = await registry.detectFormat(APPLE_DOCSET);
      expect(format).not.toBeNull();

      await format!.initialize(APPLE_DOCSET);
      expect(format!.isInitialized()).toBe(true);

      const count = format!.getEntryCount();
      expect(count).toBeGreaterThan(0);

      format!.close();
    });

    it('should iterate entries', async () => {
      if (!existsSync(APPLE_DOCSET)) return;

      const format = await registry.detectFormat(APPLE_DOCSET);
      await format!.initialize(APPLE_DOCSET);

      const entries = [];
      for (const entry of format!.iterateEntries({ limit: 5 })) {
        entries.push(entry);
      }

      expect(entries.length).toBe(5);
      expect(entries[0]).toHaveProperty('id');
      expect(entries[0]).toHaveProperty('name');
      expect(entries[0]).toHaveProperty('type');
      expect(entries[0]).toHaveProperty('path');

      format!.close();
    });

    it('should extract content', async () => {
      if (!existsSync(APPLE_DOCSET)) return;

      const format = await registry.detectFormat(APPLE_DOCSET);
      await format!.initialize(APPLE_DOCSET);

      let content = null;
      for (const entry of format!.iterateEntries({ types: ['Class'], limit: 1 })) {
        content = await format!.extractContent(entry);
        break;
      }

      expect(content).not.toBeNull();
      expect(content).toHaveProperty('title');
      expect(content).toHaveProperty('type');

      format!.close();
    });

    it('should get types', async () => {
      if (!existsSync(APPLE_DOCSET)) return;

      const format = await registry.detectFormat(APPLE_DOCSET);
      await format!.initialize(APPLE_DOCSET);

      const types = format!.getTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      expect(types).toContain('Class');

      format!.close();
    });

    it('should get categories (frameworks)', async () => {
      if (!existsSync(APPLE_DOCSET)) return;

      const format = await registry.detectFormat(APPLE_DOCSET);
      await format!.initialize(APPLE_DOCSET);

      const categories = format!.getCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories).toContain('UIKit');

      format!.close();
    });
  });

  describe('Standard Dash Format (PHP)', () => {
    it('should initialize and get entry count', async () => {
      if (!existsSync(PHP_DOCSET)) {
        console.warn('Skipping: PHP.docset not found');
        return;
      }

      const format = await registry.detectFormat(PHP_DOCSET);
      expect(format).not.toBeNull();

      await format!.initialize(PHP_DOCSET);
      expect(format!.isInitialized()).toBe(true);

      const count = format!.getEntryCount();
      expect(count).toBeGreaterThan(0);

      format!.close();
    });

    it('should iterate entries', async () => {
      if (!existsSync(PHP_DOCSET)) return;

      const format = await registry.detectFormat(PHP_DOCSET);
      await format!.initialize(PHP_DOCSET);

      const entries = [];
      for (const entry of format!.iterateEntries({ limit: 5 })) {
        entries.push(entry);
      }

      expect(entries.length).toBe(5);
      expect(entries[0]).toHaveProperty('id');
      expect(entries[0]).toHaveProperty('name');
      expect(entries[0]).toHaveProperty('type');
      expect(entries[0]).toHaveProperty('path');

      format!.close();
    });

    it('should extract content from tarix', async () => {
      if (!existsSync(PHP_DOCSET)) return;

      const format = await registry.detectFormat(PHP_DOCSET);
      await format!.initialize(PHP_DOCSET);

      let content = null;
      for (const entry of format!.iterateEntries({ types: ['Function'], limit: 10 })) {
        content = await format!.extractContent(entry);
        if (content) break;
      }

      expect(content).not.toBeNull();
      expect(content).toHaveProperty('title');
      expect(content).toHaveProperty('type');

      format!.close();
    }, 30000);

    it('should get types', async () => {
      if (!existsSync(PHP_DOCSET)) return;

      const format = await registry.detectFormat(PHP_DOCSET);
      await format!.initialize(PHP_DOCSET);

      const types = format!.getTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      expect(types).toContain('Function');
      expect(types).toContain('Class');

      format!.close();
    });

    it('should not support categories', async () => {
      if (!existsSync(PHP_DOCSET)) return;

      const format = await registry.detectFormat(PHP_DOCSET);
      await format!.initialize(PHP_DOCSET);

      const categories = format!.getCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(0);

      format!.close();
    });
  });

  describe('CoreData Format (C)', () => {
    it('should initialize and get entry count', async () => {
      if (!existsSync(C_DOCSET)) {
        console.warn('Skipping: C.docset not found');
        return;
      }

      const format = await registry.detectFormat(C_DOCSET);
      expect(format).not.toBeNull();

      await format!.initialize(C_DOCSET);
      expect(format!.isInitialized()).toBe(true);

      const count = format!.getEntryCount();
      expect(count).toBeGreaterThan(0);

      format!.close();
    });

    it('should iterate entries', async () => {
      if (!existsSync(C_DOCSET)) return;

      const format = await registry.detectFormat(C_DOCSET);
      await format!.initialize(C_DOCSET);

      const entries = [];
      for (const entry of format!.iterateEntries({ limit: 5 })) {
        entries.push(entry);
      }

      expect(entries.length).toBeLessThanOrEqual(5);
      if (entries.length > 0) {
        expect(entries[0]).toHaveProperty('id');
        expect(entries[0]).toHaveProperty('name');
        expect(entries[0]).toHaveProperty('type');
        expect(entries[0]).toHaveProperty('path');
      }

      format!.close();
    });

    it('should extract content from tarix', async () => {
      if (!existsSync(C_DOCSET)) return;

      const format = await registry.detectFormat(C_DOCSET);
      await format!.initialize(C_DOCSET);

      let content = null;
      for (const entry of format!.iterateEntries({ types: ['Function'], limit: 10 })) {
        content = await format!.extractContent(entry);
        if (content) break;
      }

      expect(content).not.toBeNull();
      expect(content).toHaveProperty('title');
      expect(content).toHaveProperty('type');

      format!.close();
    }, 30000);

    it('should get types', async () => {
      if (!existsSync(C_DOCSET)) return;

      const format = await registry.detectFormat(C_DOCSET);
      await format!.initialize(C_DOCSET);

      const types = format!.getTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      expect(types).toContain('Function');
      expect(types).toContain('Macro');

      format!.close();
    });
  });

  describe('Content Quality', () => {
    it('should generate valid markdown from PHP docset', async () => {
      if (!existsSync(PHP_DOCSET)) return;

      const format = await registry.detectFormat(PHP_DOCSET);
      await format!.initialize(PHP_DOCSET);

      for (const entry of format!.iterateEntries({ types: ['Function'], limit: 3 })) {
        const content = await format!.extractContent(entry);
        if (content?.description) {
          // Should have markdown content
          expect(content.description.length).toBeGreaterThan(0);
          // Should not have raw HTML tags (basic check)
          expect(content.description).not.toMatch(/<script/i);
          expect(content.description).not.toMatch(/<style/i);
        }
      }

      format!.close();
    }, 30000);

    it('should generate valid markdown from C docset', async () => {
      if (!existsSync(C_DOCSET)) return;

      const format = await registry.detectFormat(C_DOCSET);
      await format!.initialize(C_DOCSET);

      for (const entry of format!.iterateEntries({ types: ['Function'], limit: 3 })) {
        const content = await format!.extractContent(entry);
        if (content?.description) {
          // Should have markdown content
          expect(content.description.length).toBeGreaterThan(0);
          // Should not have raw HTML tags (basic check)
          expect(content.description).not.toMatch(/<script/i);
          expect(content.description).not.toMatch(/<style/i);
        }
      }

      format!.close();
    }, 30000);
  });
});
