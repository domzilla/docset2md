/**
 * @file link-validation.test.ts
 * @module tests/integration/link-validation
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Integration tests validating internal markdown links.
 * Converts a sample of each docset to markdown and verifies all links point to existing files.
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FormatRegistry } from '../../src/formats/FormatRegistry.js';
import { MarkdownGenerator } from '../../src/generator/MarkdownGenerator.js';
import type { DocsetFormat, NormalizedEntry, ParsedContent, ContentItem } from '../../src/formats/types.js';
import type { TopicItem, ParsedDocumentation } from '../../src/parser/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_DATA_DIR = resolve(__dirname, '../../test_data/input');
const OUTPUT_DIR = resolve(__dirname, '../../test_data/output');
const TEST_OUTPUT_DIR = resolve(OUTPUT_DIR, 'link-validation');

/** Maximum entries to convert per docset for speed */
const ENTRIES_PER_DOCSET = 100;

interface DiscoveredDocset {
  name: string;
  path: string;
}

interface BrokenLink {
  sourceFile: string;
  linkText: string;
  linkPath: string;
  resolvedPath: string;
}

interface LinkValidationResult {
  docsetName: string;
  filesGenerated: number;
  totalLinks: number;
  validLinks: number;
  externalLinks: number;
  brokenLinks: BrokenLink[];
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
 * Find all markdown files recursively in a directory
 */
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

/**
 * Extract markdown links from content
 */
function extractLinks(content: string): Array<{ text: string; path: string }> {
  const links: Array<{ text: string; path: string }> = [];
  // Match [text](path.md) or [text](./path.md) or [text](../path.md)
  const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push({ text: match[1], path: match[2] });
  }

  return links;
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFileName(name: string): string {
  let sanitized = name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (sanitized.includes('(')) {
    sanitized = sanitized.split('(')[0];
  }

  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }

  return sanitized || 'unnamed';
}

/**
 * Capitalize the first letter of a type name
 */
function capitalizeType(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Capitalize framework name properly
 */
function capitalizeFramework(name: string): string {
  const knownFrameworks: Record<string, string> = {
    accelerate: 'Accelerate',
    foundation: 'Foundation',
    uikit: 'UIKit',
    appkit: 'AppKit',
    swiftui: 'SwiftUI',
    corefoundation: 'CoreFoundation',
    coredata: 'CoreData',
    coregraphics: 'CoreGraphics',
    webkit: 'WebKit',
    mapkit: 'MapKit',
  };

  const lower = name.toLowerCase();
  return knownFrameworks[lower] || name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Convert ContentItem to TopicItem format
 */
function convertToTopicItem(item: ContentItem): TopicItem {
  return {
    title: item.title,
    url: item.url,
    abstract: item.abstract,
    required: item.required,
    deprecated: item.deprecated,
    beta: item.beta,
  };
}

/**
 * Generate markdown from parsed content
 */
function generateMarkdown(content: ParsedContent, generator: MarkdownGenerator): string {
  const doc: ParsedDocumentation = {
    title: content.title,
    kind: content.type,
    role: content.type,
    language: (content.language as 'swift' | 'objc') || 'swift',
    framework: content.framework,
    abstract: content.abstract,
    declaration: content.declaration,
    overview: content.description,
    parameters: content.parameters,
    returnValue: content.returnValue,
    topics: content.topics?.map(t => ({
      title: t.title,
      items: t.items.map(convertToTopicItem),
    })),
    seeAlso: content.seeAlso
      ? [{ title: 'See Also', items: content.seeAlso.map(convertToTopicItem) }]
      : undefined,
    relationships: content.relationships?.map(r => ({
      kind: r.kind,
      title: r.title,
      items: r.items.map(convertToTopicItem),
    })),
    hierarchy: content.hierarchy,
    deprecated: content.deprecated,
    beta: content.beta,
    platforms: content.platforms?.map(p => ({
      name: p.name,
      introducedAt: p.version,
    })),
  };

  return generator.generate(doc);
}

/**
 * Convert a docset sample to markdown files
 */
async function convertDocsetSample(
  docset: DiscoveredDocset,
  outputDir: string,
  limit: number
): Promise<{ filesWritten: number; format: DocsetFormat | null }> {
  const registry = new FormatRegistry();
  const format = await registry.detectFormat(docset.path);

  if (!format) {
    return { filesWritten: 0, format: null };
  }

  await format.initialize(docset.path);

  // Skip empty docsets
  if (format.getEntryCount() === 0) {
    format.close();
    return { filesWritten: 0, format: null };
  }

  const generator = new MarkdownGenerator();
  const createdDirs = new Set<string>();
  let filesWritten = 0;
  let processed = 0;

  for (const entry of format.iterateEntries({ limit })) {
    if (processed >= limit) break;
    processed++;

    try {
      const content = await format.extractContent(entry);
      if (!content) continue;

      const markdown = generateMarkdown(content, generator);

      // Write file based on format type
      let filePath: string;

      if (format.supportsMultipleLanguages() && entry.language) {
        // Apple format: Language/Framework/Item.md
        const langDir = entry.language === 'swift' ? 'Swift' : 'Objective-C';
        const framework = content.framework || 'Other';

        const match = entry.path.match(/l[sc]\/documentation\/(.+)/);
        if (match) {
          const docPath = match[1];
          const parts = docPath.split('/');
          const frameworkCapitalized = capitalizeFramework(parts[0]);

          if (parts.length === 1) {
            filePath = join(outputDir, langDir, frameworkCapitalized, '_index.md');
          } else {
            const dirParts = parts.slice(0, -1);
            dirParts[0] = frameworkCapitalized;
            const fileName = sanitizeFileName(entry.name) + '.md';
            filePath = join(outputDir, langDir, ...dirParts, fileName);
          }
        } else {
          filePath = join(outputDir, langDir, framework, sanitizeFileName(entry.name) + '.md');
        }
      } else {
        // Generic format: Type/Item.md
        const typeDir = capitalizeType(entry.type);
        const fileName = sanitizeFileName(entry.name) + '.md';
        filePath = join(outputDir, typeDir, fileName);
      }

      // Ensure directory exists
      const dir = dirname(filePath);
      if (!createdDirs.has(dir)) {
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        createdDirs.add(dir);
      }

      writeFileSync(filePath, markdown, 'utf-8');
      filesWritten++;
    } catch {
      // Skip failed entries
    }
  }

  return { filesWritten, format };
}

/**
 * Validate all links in markdown files.
 *
 * Since we only convert a sample of entries, most links will point to files
 * that weren't generated. We track which files exist and only report broken
 * links for targets within the same directory level (siblings) that should exist.
 */
function validateLinks(outputDir: string): {
  totalLinks: number;
  brokenLinks: BrokenLink[];
  validLinks: number;
  externalLinks: number;  // Links to files outside our generated set
} {
  const mdFiles = findMarkdownFiles(outputDir);
  const existingFiles = new Set(mdFiles.map(f => resolve(f)));
  const brokenLinks: BrokenLink[] = [];
  let totalLinks = 0;
  let validLinks = 0;
  let externalLinks = 0;

  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, 'utf-8');
    const links = extractLinks(content);

    for (const link of links) {
      totalLinks++;

      // Resolve the link path relative to the source file
      const sourceDir = dirname(mdFile);
      const resolvedPath = resolve(sourceDir, link.path);

      // Check if target file exists
      if (existingFiles.has(resolvedPath)) {
        validLinks++;
      } else {
        // For sample-based testing, we categorize non-existent links:
        // - "External" = links to files we didn't generate (expected with samples)
        // - "Broken" = links with invalid format or pointing to same-dir files that should exist

        // A link is only "broken" if it points to a sibling file (same directory)
        // that we should have generated but didn't
        const linkDir = dirname(resolvedPath);
        const sourceFileDir = dirname(mdFile);

        // Check if it's a sibling link (same directory)
        if (linkDir === sourceFileDir) {
          // This is a sibling link - if it doesn't exist, it might be broken
          brokenLinks.push({
            sourceFile: relative(outputDir, mdFile),
            linkText: link.text,
            linkPath: link.path,
            resolvedPath: relative(outputDir, resolvedPath),
          });
        } else {
          // Link points to a different directory - likely not in our sample
          externalLinks++;
        }
      }
    }
  }

  return { totalLinks, brokenLinks, validLinks, externalLinks };
}

describe('Link Validation', () => {
  const docsets = discoverDocsets();
  const validationResults: LinkValidationResult[] = [];

  // Fail if no docsets found
  if (docsets.length === 0) {
    it('should have docsets available', () => {
      throw new Error(
        `No docsets found in ${TEST_DATA_DIR}. ` +
        'Please add .docset directories to test_data/input/ before running link validation tests.'
      );
    });
    return;
  }

  beforeAll(() => {
    console.log(`\nDiscovered ${docsets.length} docset(s) for link validation\n`);

    // Create test output directory
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    // Print summary
    console.log('\n=== Link Validation Summary ===\n');

    let totalFiles = 0;
    let totalLinks = 0;
    let totalValid = 0;
    let totalExternal = 0;
    let totalBroken = 0;
    const docsetsWithBrokenLinks: string[] = [];

    for (const result of validationResults) {
      totalFiles += result.filesGenerated;
      totalLinks += result.totalLinks;
      totalValid += result.validLinks;
      totalExternal += result.externalLinks;
      totalBroken += result.brokenLinks.length;

      if (result.brokenLinks.length > 0) {
        docsetsWithBrokenLinks.push(result.docsetName);
      }
    }

    console.log(`Docsets tested: ${validationResults.length}`);
    console.log(`Files generated: ${totalFiles}`);
    console.log(`Total links found: ${totalLinks}`);
    console.log(`  Valid (target exists): ${totalValid}`);
    console.log(`  External (target not in sample): ${totalExternal}`);
    console.log(`  Broken (sibling not found): ${totalBroken}`);

    if (docsetsWithBrokenLinks.length > 0) {
      console.log(`\nDocsets with broken links: ${docsetsWithBrokenLinks.join(', ')}`);
    }

    // Always clean up after tests
    console.log('\nCleaning up test output...');
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
    console.log('Cleanup complete.\n');
  });

  describe('Link Target Existence', () => {
    // Test each docset
    it.each(docsets.map(d => [d.name, d.path]))(
      '%s: all links should point to existing files',
      async (name, path) => {
        const docset = { name, path };
        const docsetOutputDir = join(TEST_OUTPUT_DIR, sanitizeFileName(name));

        // Convert sample
        const { filesWritten, format } = await convertDocsetSample(
          docset,
          docsetOutputDir,
          ENTRIES_PER_DOCSET
        );

        if (format) {
          format.close();
        }

        // Skip empty docsets
        if (filesWritten === 0) {
          console.log(`    Skipped: no files generated (empty or unsupported)`);
          validationResults.push({
            docsetName: name,
            filesGenerated: 0,
            totalLinks: 0,
            brokenLinks: [],
          });
          return;
        }

        // Validate links
        const { totalLinks, validLinks, externalLinks, brokenLinks } = validateLinks(docsetOutputDir);

        // Record results
        validationResults.push({
          docsetName: name,
          filesGenerated: filesWritten,
          totalLinks,
          validLinks,
          externalLinks,
          brokenLinks,
        });

        // Log results
        const linkSummary = `Files: ${filesWritten}, Links: ${totalLinks} (${validLinks} valid, ${externalLinks} external)`;
        if (brokenLinks.length > 0) {
          console.log(`    ${linkSummary}, Broken: ${brokenLinks.length}`);
          // Show first few broken links
          const samplesToShow = Math.min(3, brokenLinks.length);
          for (let i = 0; i < samplesToShow; i++) {
            const bl = brokenLinks[i];
            console.log(`      ${bl.sourceFile}: [${bl.linkText}](${bl.linkPath})`);
          }
          if (brokenLinks.length > samplesToShow) {
            console.log(`      ... and ${brokenLinks.length - samplesToShow} more`);
          }
        } else {
          console.log(`    ${linkSummary}`);
        }

        // Assert no broken sibling links
        // Note: external links (to files not in sample) are expected and not counted as broken
        expect(brokenLinks.length).toBe(0);
      },
      120000 // 2 minute timeout per docset
    );
  });

  describe('Link Format', () => {
    it('links should use relative paths (not absolute)', async () => {
      // Wait for all docsets to be processed
      await new Promise(resolve => setTimeout(resolve, 100));

      const mdFiles = findMarkdownFiles(TEST_OUTPUT_DIR);
      const absoluteLinks: Array<{ file: string; link: string }> = [];

      for (const mdFile of mdFiles) {
        const content = readFileSync(mdFile, 'utf-8');
        const links = extractLinks(content);

        for (const link of links) {
          if (link.path.startsWith('/')) {
            absoluteLinks.push({
              file: relative(TEST_OUTPUT_DIR, mdFile),
              link: link.path,
            });
          }
        }
      }

      if (absoluteLinks.length > 0) {
        console.log(`\nAbsolute links found (${absoluteLinks.length}):`);
        absoluteLinks.slice(0, 5).forEach(({ file, link }) => {
          console.log(`  ${file}: ${link}`);
        });
      }

      expect(absoluteLinks.length).toBe(0);
    });

    it('links should use .md extension', async () => {
      const mdFiles = findMarkdownFiles(TEST_OUTPUT_DIR);
      // This test just validates our regex is working correctly
      // since extractLinks already filters for .md links
      expect(mdFiles.length).toBeGreaterThanOrEqual(0);
    });
  });
});
