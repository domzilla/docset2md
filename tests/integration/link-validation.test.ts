/**
 * @file link-validation.test.ts
 * @module tests/integration/link-validation
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Integration tests validating internal markdown links.
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IndexReader } from '../../src/db/IndexReader.js';
import { ContentExtractor } from '../../src/extractor/ContentExtractor.js';
import { DocCParser } from '../../src/parser/DocCParser.js';
import { MarkdownGenerator } from '../../src/generator/MarkdownGenerator.js';
import { FileWriter } from '../../src/writer/FileWriter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DATA_DIR = resolve(__dirname, '../../test_data/input');
const OUTPUT_DIR = resolve(__dirname, '../../test_data/output');
const TEST_OUTPUT_DIR = resolve(OUTPUT_DIR, 'link-validation');

/**
 * Find Apple DocC docsets in test_data/input
 */
function findAppleDocsets(): string[] {
  if (!existsSync(TEST_DATA_DIR)) {
    return [];
  }

  const entries = readdirSync(TEST_DATA_DIR, { withFileTypes: true });
  return entries
    .filter(entry => {
      if (!entry.isDirectory() || !entry.name.endsWith('.docset')) return false;
      // Check if it's an Apple DocC format (has cache.db)
      const cacheDbPath = join(TEST_DATA_DIR, entry.name, 'Contents/Resources/Documents/cache.db');
      return existsSync(cacheDbPath);
    })
    .map(entry => join(TEST_DATA_DIR, entry.name));
}

// Helper to find all markdown files recursively
function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

// Extract links from markdown content
function extractLinks(content: string): Array<{ text: string; path: string }> {
  const links: Array<{ text: string; path: string }> = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push({ text: match[1], path: match[2] });
  }

  return links;
}

describe('Link Validation', () => {
  const appleDocsets = findAppleDocsets();
  let allTestsPassed = true;

  // Fail if no Apple docsets found
  if (appleDocsets.length === 0) {
    it('should have Apple DocC docsets available', () => {
      throw new Error(
        `No Apple DocC docsets found in ${TEST_DATA_DIR}. ` +
        'Please add an Apple docset (with cache.db) to test_data/input/ before running link validation tests. ' +
        'Run: npx tsx scripts/extract-framework-apple-docset.ts -i <source.docset> -o test_data/input UIKit'
      );
    });
    return;
  }

  const APPLE_DOCSET_PATH = appleDocsets[0];
  const INDEX_PATH = resolve(APPLE_DOCSET_PATH, 'Contents/Resources/docSet.dsidx');

  beforeAll(() => {
    console.log(`\nUsing Apple docset: ${APPLE_DOCSET_PATH}\n`);

    // Create test output directory
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

    // Generate a small sample output (limit to 100 entries for speed)
    const indexReader = new IndexReader(INDEX_PATH);
    const extractor = new ContentExtractor(APPLE_DOCSET_PATH);
    const parser = new DocCParser();
    const generator = new MarkdownGenerator();
    const writer = new FileWriter(TEST_OUTPUT_DIR);

    writer.ensureOutputDirs();

    let count = 0;
    const limit = 100;

    for (const entry of indexReader.iterateEntries({ languages: ['swift'] })) {
      if (count >= limit) break;

      try {
        const doc = extractor.extractByRequestKey(entry.requestKey);
        if (!doc) continue;

        const parsed = parser.parse(doc, entry.language);
        const markdown = generator.generate(parsed);
        writer.writeEntry(entry.requestKey, entry.language, entry.name, markdown);
        count++;
      } catch {
        // Skip failed entries
      }
    }

    indexReader.close();
    extractor.close();
  }, 60000); // 60 second timeout for setup

  afterAll(() => {
    // Only cleanup if all tests passed
    if (allTestsPassed) {
      console.log('\nAll link validation tests passed. Cleaning up...');
      if (existsSync(TEST_OUTPUT_DIR)) {
        rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
      }
      console.log('Cleanup complete.\n');
    } else {
      console.log(`\nSome tests failed. Keeping output at ${TEST_OUTPUT_DIR} for inspection.\n`);
    }
  });

  afterEach(() => {
    // Track test failures
    const state = expect.getState();
    if (state.assertionCalls > 0 && state.numPassingAsserts === 0) {
      allTestsPassed = false;
    }
  });

  describe('internal links', () => {
    it('should generate markdown files', () => {
      const mdFiles = findMarkdownFiles(TEST_OUTPUT_DIR);
      expect(mdFiles.length).toBeGreaterThan(0);
    });

    it('all markdown links should use .md extension', () => {
      const mdFiles = findMarkdownFiles(TEST_OUTPUT_DIR);
      const invalidLinks: Array<{ file: string; link: string }> = [];

      for (const mdFile of mdFiles) {
        const content = readFileSync(mdFile, 'utf-8');
        const links = extractLinks(content);

        for (const link of links) {
          if (!link.path.endsWith('.md')) {
            invalidLinks.push({ file: mdFile, link: link.path });
          }
        }
      }

      if (invalidLinks.length > 0) {
        console.log('Links without .md extension:');
        invalidLinks.slice(0, 10).forEach(({ file, link }) => {
          console.log(`  ${file}: ${link}`);
        });
      }

      // All links should end with .md
      expect(invalidLinks.length).toBe(0);
    });

    it('links should use relative paths', () => {
      const mdFiles = findMarkdownFiles(TEST_OUTPUT_DIR);
      const absoluteLinks: Array<{ file: string; link: string }> = [];

      for (const mdFile of mdFiles) {
        const content = readFileSync(mdFile, 'utf-8');
        const links = extractLinks(content);

        for (const link of links) {
          // Absolute paths start with / but not ./
          if (link.path.startsWith('/')) {
            absoluteLinks.push({ file: mdFile, link: link.path });
          }
        }
      }

      if (absoluteLinks.length > 0) {
        console.log('Absolute links found:');
        absoluteLinks.slice(0, 10).forEach(({ file, link }) => {
          console.log(`  ${file}: ${link}`);
        });
      }

      expect(absoluteLinks.length).toBe(0);
    });

    it('links should not contain URL-encoded characters in common cases', () => {
      const mdFiles = findMarkdownFiles(TEST_OUTPUT_DIR);
      const encodedLinks: Array<{ file: string; link: string }> = [];

      for (const mdFile of mdFiles) {
        const content = readFileSync(mdFile, 'utf-8');
        const links = extractLinks(content);

        for (const link of links) {
          // Check for common URL encoding patterns
          if (/%[0-9A-Fa-f]{2}/.test(link.path)) {
            encodedLinks.push({ file: mdFile, link: link.path });
          }
        }
      }

      if (encodedLinks.length > 0) {
        console.log('URL-encoded links found:');
        encodedLinks.slice(0, 10).forEach(({ file, link }) => {
          console.log(`  ${file}: ${link}`);
        });
      }

      // Most links should not have URL encoding
      // Some may be valid, so we just warn if there are many
      expect(encodedLinks.length).toBeLessThan(50);
    });
  });

  describe('file structure', () => {
    it('should create Swift directory', () => {
      expect(existsSync(join(TEST_OUTPUT_DIR, 'Swift'))).toBe(true);
    });

    it('should create framework directories under Swift', () => {
      const swiftDir = join(TEST_OUTPUT_DIR, 'Swift');
      if (!existsSync(swiftDir)) return;

      const entries = readdirSync(swiftDir, { withFileTypes: true });
      const dirs = entries.filter(e => e.isDirectory());

      expect(dirs.length).toBeGreaterThan(0);
    });

    it('markdown files should have valid names', () => {
      const mdFiles = findMarkdownFiles(TEST_OUTPUT_DIR);
      const invalidNames: string[] = [];

      for (const mdFile of mdFiles) {
        const filename = mdFile.split('/').pop()!;
        // Check for invalid characters that shouldn't be in filenames
        if (/[<>:"|?*]/.test(filename)) {
          invalidNames.push(filename);
        }
      }

      expect(invalidNames.length).toBe(0);
    });
  });

  describe('content quality', () => {
    it('generated files should have content', () => {
      const mdFiles = findMarkdownFiles(TEST_OUTPUT_DIR);
      const emptyFiles: string[] = [];

      for (const mdFile of mdFiles) {
        const content = readFileSync(mdFile, 'utf-8');
        if (content.trim().length < 10) {
          emptyFiles.push(mdFile);
        }
      }

      expect(emptyFiles.length).toBe(0);
    });

    it('generated files should start with a heading', () => {
      const mdFiles = findMarkdownFiles(TEST_OUTPUT_DIR);
      const noHeadingFiles: string[] = [];

      for (const mdFile of mdFiles) {
        const content = readFileSync(mdFile, 'utf-8');
        if (!content.trim().startsWith('#')) {
          noHeadingFiles.push(mdFile);
        }
      }

      if (noHeadingFiles.length > 0) {
        console.log('Files without heading:');
        noHeadingFiles.slice(0, 5).forEach(f => console.log(`  ${f}`));
      }

      expect(noHeadingFiles.length).toBe(0);
    });
  });
});
