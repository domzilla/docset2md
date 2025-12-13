/**
 * @file LinkValidator.ts
 * @module shared/LinkValidator
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Validates internal markdown links in converted docsets.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';

/**
 * Represents a broken link found during validation.
 */
export interface BrokenLink {
  /** Relative path to the source file containing the broken link */
  sourceFile: string;
  /** The link text (what appears between [ and ]) */
  linkText: string;
  /** The link path (what appears between ( and )) */
  linkPath: string;
  /** The resolved absolute path that was checked */
  resolvedPath: string;
}

/**
 * Results from link validation.
 */
export interface ValidationResult {
  /** Total number of internal links found */
  totalLinks: number;
  /** Number of valid links (target exists) */
  validLinks: number;
  /** List of broken links */
  brokenLinks: BrokenLink[];
  /** List of absolute links (should be relative) */
  absoluteLinks: Array<{ file: string; link: string }>;
}

/**
 * Find all markdown files iteratively in a directory.
 *
 * Uses an iterative stack-based approach to avoid call stack overflow
 * on large docsets with deep directory structures.
 *
 * @param dir - Directory to search
 * @returns Array of absolute paths to markdown files
 */
function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  const stack: string[] = [dir];

  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    const entries = readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Extract markdown links from content.
 *
 * Matches links in the format [text](path.md).
 *
 * @param content - Markdown content to scan
 * @returns Array of link text and path pairs
 */
function extractLinks(content: string): Array<{ text: string; path: string }> {
  const links: Array<{ text: string; path: string }> = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push({ text: match[1], path: match[2] });
  }

  return links;
}

/**
 * Validate all internal links in markdown files.
 *
 * Scans all markdown files in the output directory and checks that
 * each internal link points to an existing file.
 *
 * @param outputDir - Directory containing markdown files
 * @param verbose - Whether to show detailed progress
 * @returns Validation results
 */
export function validateLinks(outputDir: string, verbose: boolean = false): ValidationResult {
  console.log('Validating links...');
  console.log('  Scanning for markdown files...');
  const mdFiles = findMarkdownFiles(outputDir);
  console.log(`  Found ${mdFiles.length.toLocaleString()} markdown files`);

  console.log('  Building file index...');
  const existingFiles = new Set(mdFiles.map(f => resolve(f)));

  console.log('  Checking links...');
  const brokenLinks: BrokenLink[] = [];
  const absoluteLinks: Array<{ file: string; link: string }> = [];
  let totalLinks = 0;
  let validLinks = 0;
  let filesProcessed = 0;

  for (const mdFile of mdFiles) {
    filesProcessed++;
    if (!verbose && filesProcessed % 10000 === 0) {
      process.stdout.write(
        `\r  Progress: ${filesProcessed.toLocaleString()}/${mdFiles.length.toLocaleString()} files checked`
      );
    }

    const content = readFileSync(mdFile, 'utf-8');
    const links = extractLinks(content);

    for (const link of links) {
      // Skip external links (http/https URLs)
      if (link.path.startsWith('http://') || link.path.startsWith('https://')) {
        continue;
      }

      totalLinks++;

      // Check for absolute links
      if (link.path.startsWith('/')) {
        absoluteLinks.push({
          file: relative(outputDir, mdFile),
          link: link.path,
        });
        continue;
      }

      // Resolve the link path relative to the source file
      const sourceDir = dirname(mdFile);
      const resolvedPath = resolve(sourceDir, link.path);

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

  if (!verbose && filesProcessed >= 10000) {
    process.stdout.write('\n');
  }

  return { totalLinks, validLinks, brokenLinks, absoluteLinks };
}

/**
 * Print validation results to console.
 *
 * @param results - Validation results to print
 */
export function printValidationResults(results: ValidationResult): void {
  console.log('\n=== Link Validation Results ===\n');
  console.log(`Total links: ${results.totalLinks.toLocaleString()}`);
  console.log(`  Valid: ${results.validLinks.toLocaleString()}`);
  console.log(`  Broken: ${results.brokenLinks.length.toLocaleString()}`);

  if (results.absoluteLinks.length > 0) {
    console.log(`  Absolute (should be relative): ${results.absoluteLinks.length}`);
  }

  // Report broken links
  if (results.brokenLinks.length > 0) {
    console.log(`\n=== Broken Links (first 100 of ${results.brokenLinks.length}) ===\n`);

    // Group by source file
    const bySource = new Map<string, BrokenLink[]>();
    for (const link of results.brokenLinks) {
      const existing = bySource.get(link.sourceFile) || [];
      existing.push(link);
      bySource.set(link.sourceFile, existing);
    }

    let shown = 0;
    for (const [sourceFile, links] of bySource) {
      if (shown >= 100) {
        console.log(`... and ${results.brokenLinks.length - shown} more broken links`);
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
  if (results.absoluteLinks.length > 0) {
    console.log(`\n=== Absolute Links (should be relative) ===\n`);
    for (const { file, link } of results.absoluteLinks.slice(0, 20)) {
      console.log(`  ${file}: ${link}`);
    }
    if (results.absoluteLinks.length > 20) {
      console.log(`  ... and ${results.absoluteLinks.length - 20} more`);
    }
  }

  // Summary
  const hasIssues = results.brokenLinks.length > 0 || results.absoluteLinks.length > 0;
  console.log('');
  if (hasIssues) {
    console.log('VALIDATION: ISSUES FOUND');
    if (results.brokenLinks.length > 0) {
      console.log(`  - ${results.brokenLinks.length.toLocaleString()} broken link(s)`);
    }
    if (results.absoluteLinks.length > 0) {
      console.log(`  - ${results.absoluteLinks.length} absolute link(s)`);
    }
  } else {
    console.log('VALIDATION: PASSED');
    console.log(`All ${results.validLinks.toLocaleString()} links are valid.`);
  }
}
