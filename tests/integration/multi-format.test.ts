/**
 * @file multi-format.test.ts
 * @module tests/integration/multi-format
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Integration tests for multi-format docset support.
 */

import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormatDetector } from '../../src/factory/FormatDetector.js';
import type { DocsetFormat } from '../../src/shared/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DATA_DIR = join(__dirname, '../../test_data/input');
const OUTPUT_DIR = join(__dirname, '../../test_data/output/multi-format');

interface DiscoveredDocset {
  name: string;
  path: string;
}

/**
 * Discover all .docset directories in test_data/input
 */
function discoverDocsets(): DiscoveredDocset[] {
  if (!existsSync(TEST_DATA_DIR)) {
    return [];
  }

  const entries = readdirSync(TEST_DATA_DIR, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory() && entry.name.endsWith('.docset'))
    .map(entry => ({
      name: entry.name.replace('.docset', ''),
      path: join(TEST_DATA_DIR, entry.name),
    }));
}

/**
 * Clean up output directory contents
 */
function cleanupOutput(): void {
  if (existsSync(OUTPUT_DIR)) {
    try {
      rmSync(OUTPUT_DIR, { recursive: true, force: true });
      mkdirSync(OUTPUT_DIR, { recursive: true });
    } catch (err) {
      console.warn('Warning: Could not fully clean output directory:', err);
    }
  }
}

describe('Multi-Format Support', () => {
  let registry: FormatDetector;
  let docsets: DiscoveredDocset[];

  beforeAll(() => {
    registry = new FormatDetector();
    docsets = discoverDocsets();

    // Fail immediately if no docsets found
    if (docsets.length === 0) {
      throw new Error(
        `No docsets found in ${TEST_DATA_DIR}. ` +
        'Please add .docset directories to test_data/input/ before running integration tests. ' +
        'For Apple docsets, run: npx tsx scripts/extract-framework-apple-docset.ts -i <source.docset> -o test_data/input UIKit'
      );
    }

    console.log(`\nDiscovered ${docsets.length} docset(s): ${docsets.map(d => d.name).join(', ')}\n`);

    // Prepare output directory
    if (!existsSync(OUTPUT_DIR)) {
      mkdirSync(OUTPUT_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // Always clean up after tests
    console.log('\nCleaning up test_data/output...');
    cleanupOutput();
    console.log('Cleanup complete.\n');
  });

  describe('Docset Discovery', () => {
    it('should find at least one docset', () => {
      expect(docsets.length).toBeGreaterThan(0);
    });

    it('should have valid docset paths', () => {
      for (const docset of docsets) {
        expect(existsSync(docset.path)).toBe(true);
      }
    });
  });

  describe('Format Detection', () => {
    it('should detect format for all discovered docsets', async () => {
      for (const docset of docsets) {
        const format = await registry.detectFormat(docset.path);
        expect(format).not.toBeNull();
        console.log(`  ${docset.name}: ${format!.getName()}`);
      }
    });

    it('should return null for non-existent path', async () => {
      const format = await registry.detectFormat('/nonexistent/path.docset');
      expect(format).toBeNull();
    });
  });

  describe('Format Operations', () => {
    it.each(discoverDocsets().map(d => [d.name, d.path]))(
      '%s: should initialize and get entry count',
      async (name, path) => {
        const format = await registry.detectFormat(path);
        expect(format).not.toBeNull();

        await format!.initialize(path);
        expect(format!.isInitialized()).toBe(true);

        const count = format!.getEntryCount();
        expect(count).toBeGreaterThanOrEqual(0);
        if (count === 0) {
          console.log(`    Entry count: 0 (empty docset - placeholder)`);
        } else {
          console.log(`    Entry count: ${count}`);
        }

        format!.close();
      }
    );

    it.each(discoverDocsets().map(d => [d.name, d.path]))(
      '%s: should iterate entries',
      async (name, path) => {
        const format = await registry.detectFormat(path);
        await format!.initialize(path);

        // Skip empty docsets (placeholders)
        const count = format!.getEntryCount();
        if (count === 0) {
          console.log(`    Skipped: empty docset (placeholder)`);
          format!.close();
          return;
        }

        const entries = [];
        for (const entry of format!.iterateEntries({ limit: 5 })) {
          entries.push(entry);
        }

        expect(entries.length).toBeGreaterThan(0);
        expect(entries.length).toBeLessThanOrEqual(5);

        // Verify entry structure
        expect(entries[0]).toHaveProperty('id');
        expect(entries[0]).toHaveProperty('name');
        expect(entries[0]).toHaveProperty('type');
        expect(entries[0]).toHaveProperty('path');

        format!.close();
      }
    );

    it.each(discoverDocsets().map(d => [d.name, d.path]))(
      '%s: should extract content',
      async (name, path) => {
        const format = await registry.detectFormat(path);
        await format!.initialize(path);

        // Skip empty docsets (placeholders)
        const count = format!.getEntryCount();
        if (count === 0) {
          console.log(`    Skipped: empty docset (placeholder)`);
          format!.close();
          return;
        }

        let content = null;
        let attempts = 0;
        for (const entry of format!.iterateEntries({ limit: 20 })) {
          attempts++;
          content = await format!.extractContent(entry);
          if (content) break;
        }

        expect(content).not.toBeNull();
        expect(content).toHaveProperty('title');
        expect(content).toHaveProperty('type');
        console.log(`    Extracted content after ${attempts} attempt(s)`);

        format!.close();
      },
      60000 // 60s timeout for content extraction
    );

    it.each(discoverDocsets().map(d => [d.name, d.path]))(
      '%s: should get types',
      async (name, path) => {
        const format = await registry.detectFormat(path);
        await format!.initialize(path);

        // Skip empty docsets (placeholders)
        const count = format!.getEntryCount();
        if (count === 0) {
          console.log(`    Skipped: empty docset (placeholder)`);
          format!.close();
          return;
        }

        const types = format!.getTypes();
        expect(Array.isArray(types)).toBe(true);
        expect(types.length).toBeGreaterThan(0);
        console.log(`    Types: ${types.slice(0, 5).join(', ')}${types.length > 5 ? '...' : ''}`);

        format!.close();
      }
    );
  });

  describe('Content Quality', () => {
    it.each(discoverDocsets().map(d => [d.name, d.path]))(
      '%s: should generate valid markdown content',
      async (name, path) => {
        const format = await registry.detectFormat(path);
        await format!.initialize(path);

        // Skip empty docsets (placeholders)
        const count = format!.getEntryCount();
        if (count === 0) {
          console.log(`    Skipped: empty docset (placeholder)`);
          format!.close();
          return;
        }

        let validContent = 0;
        for (const entry of format!.iterateEntries({ limit: 10 })) {
          const content = await format!.extractContent(entry);
          if (content?.description) {
            // Should have markdown content
            expect(content.description.length).toBeGreaterThan(0);
            // Content should be string (basic sanity check)
            expect(typeof content.description).toBe('string');
            validContent++;
          }
        }

        console.log(`    Valid content extracted: ${validContent}`);
        format!.close();
      },
      60000
    );
  });
});
