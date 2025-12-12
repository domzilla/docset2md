#!/usr/bin/env npx tsx
/**
 * @file validate-links.ts
 * @module scripts/validate-links
 * @author Dominic Rodemer
 * @created 2025-12-12
 * @license MIT
 *
 * @fileoverview CLI script to validate internal markdown links in a converted docset.
 * Performs a full conversion of the specified docset and verifies all links point to existing files.
 *
 * Usage:
 *   npx tsx scripts/validate-links.ts <docset-path> [options]
 *
 * Options:
 *   --keep-output    Keep the generated output directory after validation
 *   --output <dir>   Specify custom output directory (default: temp directory)
 *
 * Examples:
 *   npx tsx scripts/validate-links.ts test_data/input/PHP.docset
 *   npx tsx scripts/validate-links.ts test_data/input/UIKit.docset --keep-output
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, relative, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { FormatRegistry } from '../src/formats/FormatRegistry.js';
import { MarkdownGenerator } from '../src/generator/MarkdownGenerator.js';
import type { DocsetFormat, ParsedContent, ContentItem } from '../src/formats/types.js';
import type { TopicItem, ParsedDocumentation } from '../src/parser/types.js';

interface BrokenLink {
  sourceFile: string;
  linkText: string;
  linkPath: string;
  resolvedPath: string;
}

interface ValidationResult {
  docsetName: string;
  filesGenerated: number;
  totalLinks: number;
  validLinks: number;
  brokenLinks: BrokenLink[];
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
 * Convert entire docset to markdown files (full conversion, no limit)
 */
async function convertDocset(
  docsetPath: string,
  outputDir: string,
  onProgress?: (current: number, total: number) => void
): Promise<{ filesWritten: number; format: DocsetFormat | null }> {
  const registry = new FormatRegistry();
  const format = await registry.detectFormat(docsetPath);

  if (!format) {
    return { filesWritten: 0, format: null };
  }

  await format.initialize(docsetPath);

  const totalEntries = format.getEntryCount();
  if (totalEntries === 0) {
    format.close();
    return { filesWritten: 0, format: null };
  }

  const generator = new MarkdownGenerator();
  const createdDirs = new Set<string>();
  let filesWritten = 0;
  let processed = 0;

  // Full conversion - no limit
  for (const entry of format.iterateEntries()) {
    processed++;

    if (onProgress && processed % 100 === 0) {
      onProgress(processed, totalEntries);
    }

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
 * Validate all links in markdown files
 */
function validateLinks(outputDir: string): {
  totalLinks: number;
  brokenLinks: BrokenLink[];
  validLinks: number;
} {
  const mdFiles = findMarkdownFiles(outputDir);
  const existingFiles = new Set(mdFiles.map(f => resolve(f)));
  const brokenLinks: BrokenLink[] = [];
  let totalLinks = 0;
  let validLinks = 0;

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
        brokenLinks.push({
          sourceFile: relative(outputDir, mdFile),
          linkText: link.text,
          linkPath: link.path,
          resolvedPath: relative(outputDir, resolvedPath),
        });
      }
    }
  }

  return { totalLinks, brokenLinks, validLinks };
}

/**
 * Check for absolute links (should all be relative)
 */
function checkAbsoluteLinks(outputDir: string): Array<{ file: string; link: string }> {
  const mdFiles = findMarkdownFiles(outputDir);
  const absoluteLinks: Array<{ file: string; link: string }> = [];

  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, 'utf-8');
    const links = extractLinks(content);

    for (const link of links) {
      if (link.path.startsWith('/')) {
        absoluteLinks.push({
          file: relative(outputDir, mdFile),
          link: link.path,
        });
      }
    }
  }

  return absoluteLinks;
}

/**
 * Parse command line arguments
 */
function parseArgs(): { docsetPath: string; keepOutput: boolean; outputDir?: string } {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npx tsx scripts/validate-links.ts <docset-path> [options]

Performs a full conversion of the specified docset and validates all internal
markdown links point to existing files.

Options:
  --keep-output       Keep the generated output directory after validation
  --output <dir>      Specify custom output directory (default: temp directory)
  -h, --help          Show this help message

Examples:
  npx tsx scripts/validate-links.ts test_data/input/PHP.docset
  npx tsx scripts/validate-links.ts test_data/input/UIKit.docset --keep-output
  npx tsx scripts/validate-links.ts test_data/input/C.docset --output ./output
`);
    process.exit(0);
  }

  let docsetPath = '';
  let keepOutput = false;
  let outputDir: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--keep-output') {
      keepOutput = true;
    } else if (arg === '--output') {
      outputDir = args[++i];
    } else if (!arg.startsWith('-')) {
      docsetPath = arg;
    }
  }

  if (!docsetPath) {
    console.error('Error: No docset path provided');
    process.exit(1);
  }

  return { docsetPath, keepOutput, outputDir };
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const { docsetPath, keepOutput, outputDir: customOutputDir } = parseArgs();
  const resolvedDocsetPath = resolve(docsetPath);

  // Validate docset exists
  if (!existsSync(resolvedDocsetPath)) {
    console.error(`Error: Docset not found: ${resolvedDocsetPath}`);
    process.exit(1);
  }

  const docsetName = basename(resolvedDocsetPath).replace('.docset', '');

  // Determine output directory
  const outputDir = customOutputDir
    ? resolve(customOutputDir)
    : join(tmpdir(), `docset2md-validate-${docsetName}-${Date.now()}`);

  console.log(`\n=== Link Validation: ${docsetName} ===\n`);
  console.log(`Docset: ${resolvedDocsetPath}`);
  console.log(`Output: ${outputDir}`);
  console.log('');

  // Create output directory
  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });

  try {
    // Convert docset (full conversion)
    console.log('Converting docset (full conversion)...');
    const startTime = Date.now();

    const { filesWritten, format } = await convertDocset(
      resolvedDocsetPath,
      outputDir,
      (current, total) => {
        process.stdout.write(`\r  Progress: ${current}/${total} entries processed`);
      }
    );

    console.log(''); // New line after progress

    if (format) {
      format.close();
    }

    if (filesWritten === 0) {
      console.log('\nNo files generated. Docset may be empty or unsupported.');
      process.exit(0);
    }

    const conversionTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  Generated ${filesWritten} markdown files in ${conversionTime}s\n`);

    // Validate links
    console.log('Validating links...');
    const { totalLinks, validLinks, brokenLinks } = validateLinks(outputDir);
    const absoluteLinks = checkAbsoluteLinks(outputDir);

    // Print results
    console.log(`\n=== Results ===\n`);
    console.log(`Files generated: ${filesWritten}`);
    console.log(`Total links: ${totalLinks}`);
    console.log(`  Valid: ${validLinks}`);
    console.log(`  Broken: ${brokenLinks.length}`);

    if (absoluteLinks.length > 0) {
      console.log(`  Absolute (should be relative): ${absoluteLinks.length}`);
    }

    // Report broken links
    if (brokenLinks.length > 0) {
      console.log(`\n=== Broken Links (${brokenLinks.length}) ===\n`);

      // Group by source file
      const bySource = new Map<string, BrokenLink[]>();
      for (const link of brokenLinks) {
        const existing = bySource.get(link.sourceFile) || [];
        existing.push(link);
        bySource.set(link.sourceFile, existing);
      }

      // Show all broken links (up to 100)
      let shown = 0;
      for (const [sourceFile, links] of bySource) {
        if (shown >= 100) {
          console.log(`... and ${brokenLinks.length - shown} more broken links`);
          break;
        }

        console.log(`${sourceFile}:`);
        for (const link of links) {
          if (shown >= 100) break;
          console.log(`  -> [${link.linkText}](${link.linkPath})`);
          console.log(`     Missing: ${link.resolvedPath}`);
          shown++;
        }
      }
    }

    // Report absolute links
    if (absoluteLinks.length > 0) {
      console.log(`\n=== Absolute Links (should be relative) ===\n`);
      for (const { file, link } of absoluteLinks.slice(0, 20)) {
        console.log(`  ${file}: ${link}`);
      }
      if (absoluteLinks.length > 20) {
        console.log(`  ... and ${absoluteLinks.length - 20} more`);
      }
    }

    // Summary
    console.log('');
    const hasIssues = brokenLinks.length > 0 || absoluteLinks.length > 0;

    if (hasIssues) {
      console.log('VALIDATION FAILED');
      if (brokenLinks.length > 0) {
        console.log(`  - ${brokenLinks.length} broken link(s)`);
      }
      if (absoluteLinks.length > 0) {
        console.log(`  - ${absoluteLinks.length} absolute link(s) (should be relative)`);
      }
    } else {
      console.log('VALIDATION PASSED');
      console.log(`All ${validLinks} links are valid.`);
    }

    // Cleanup or keep output
    if (keepOutput) {
      console.log(`\nOutput kept at: ${outputDir}`);
    } else {
      console.log('\nCleaning up...');
      rmSync(outputDir, { recursive: true, force: true });
    }

    // Exit with appropriate code
    process.exit(hasIssues ? 1 : 0);

  } catch (error) {
    console.error('\nError during validation:', error);

    // Cleanup on error unless --keep-output
    if (!keepOutput && existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true });
    }

    process.exit(1);
  }
}

main();
