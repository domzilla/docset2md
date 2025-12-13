#!/usr/bin/env node

/**
 * @file index.ts
 * @module index
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview CLI entry point for converting documentation docsets to Markdown.
 * Supports Apple DocC, Standard Dash, and CoreData docset formats.
 */

/**
 * @example
 * ```bash
 * # Convert a docset to markdown
 * docset2md ./PHP.docset -o ./output
 *
 * # Convert specific types only
 * docset2md ./PHP.docset -o ./output -t Function Class
 *
 * # Show docset information
 * docset2md info ./PHP.docset
 * ```
 */

import { program } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename, join, dirname } from 'node:path';
import { FormatRegistry } from './formats/FormatRegistry.js';
import { MarkdownGenerator } from './generator/MarkdownGenerator.js';
import { validateLinks, printValidationResults } from './validator/LinkValidator.js';
import type { DocsetFormat, NormalizedEntry, ParsedContent, ContentItem } from './formats/types.js';
import type { TopicItem, ParsedDocumentation } from './parser/types.js';

/**
 * Command-line options for the convert command.
 */
interface ConvertOptions {
  /** Output directory path */
  output: string;
  /** Language filter for Apple docsets */
  language?: 'swift' | 'objc' | 'both';
  /** Framework name filters */
  framework?: string[];
  /** Entry type filters */
  type?: string[];
  /** Maximum number of entries to process */
  limit?: number;
  /** Enable verbose output */
  verbose?: boolean;
  /** Enable downloading missing content from Apple's API */
  download?: boolean;
  /** Validate links after conversion */
  validate?: boolean;
}

/**
 * CLI entry point.
 *
 * Sets up the commander program with all available commands and options,
 * then parses command-line arguments to execute the appropriate action.
 */
async function main() {
  program
    .name('docset2md')
    .description('Convert documentation docsets to Markdown')
    .version('1.0.0')
    .argument('<docset>', 'Path to the .docset directory')
    .option('-o, --output <dir>', 'Output directory', './output')
    .option('-l, --language <lang>', 'Language to export (swift, objc, both) - Apple docsets only', 'both')
    .option('-f, --framework <names...>', 'Filter by framework name(s)')
    .option('-t, --type <types...>', 'Filter by entry type(s)')
    .option('--limit <n>', 'Limit number of entries to process')
    .option('-v, --verbose', 'Enable verbose output')
    .option('--download', 'Download missing content from Apple API (Apple docsets only)')
    .option('--validate', 'Validate internal links after conversion')
    .action(convert);

  program
    .command('list-types')
    .description('List all entry types in the docset')
    .argument('<docset>', 'Path to the .docset directory')
    .action(listTypes);

  program
    .command('list-frameworks')
    .description('List all frameworks/categories in the docset')
    .argument('<docset>', 'Path to the .docset directory')
    .action(listFrameworks);

  program
    .command('info')
    .description('Show docset information')
    .argument('<docset>', 'Path to the .docset directory')
    .action(showInfo);

  await program.parseAsync();
}

/**
 * Convert a docset to markdown files.
 *
 * Main conversion command that detects the docset format, iterates through
 * all entries, extracts content, generates markdown, and writes output files.
 *
 * @param docsetPath - Path to the .docset directory
 * @param options - Conversion options (output dir, filters, etc.)
 */
async function convert(docsetPath: string, options: ConvertOptions) {
  const resolvedPath = resolve(docsetPath);

  // Validate docset exists
  if (!existsSync(resolvedPath)) {
    console.error(`Error: Docset not found at ${resolvedPath}`);
    process.exit(1);
  }

  // Detect format
  const registry = new FormatRegistry();
  const format = await registry.detectFormat(resolvedPath, {
    enableDownload: options.download,
  });

  if (!format) {
    console.error('Error: Unsupported docset format');
    console.error('Supported formats: Apple DocC, Standard Dash, CoreData');
    process.exit(1);
  }

  console.log(`Detected format: ${format.getName()}`);
  if (options.download) {
    console.log('Download mode: ENABLED (will fetch missing content from Apple API)');
  }
  console.log(`Converting docset: ${basename(resolvedPath)}`);
  console.log(`Output directory: ${resolve(options.output)}`);

  const generator = new MarkdownGenerator();
  const outputDir = resolve(options.output);

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Build filter options
  const filterOptions = {
    types: options.type,
    frameworks: options.framework,
    languages: format.supportsMultipleLanguages()
      ? options.language === 'swift'
        ? ['swift']
        : options.language === 'objc'
          ? ['objc']
          : ['swift', 'objc']
      : undefined,
    limit: options.limit ? parseInt(String(options.limit)) : undefined,
  };

  // Get entry count
  const totalCount = format.getEntryCount(filterOptions);
  console.log(`Found ${totalCount.toLocaleString()} entries to process`);

  // Track progress
  let processed = 0;
  let successful = 0;
  let failed = 0;

  // Track items for index generation
  const typeItems: Map<string, ContentItem[]> = new Map();
  const frameworkItems: Map<string, Map<string, ContentItem[]>> = new Map();
  const seenEntries: Set<string> = new Set();

  // Stats tracking
  let filesWritten = 0;
  let bytesWritten = 0;
  const createdDirs: Set<string> = new Set();

  // Process entries
  const startTime = Date.now();
  const limit = options.limit ? parseInt(String(options.limit)) : undefined;

  for (const entry of format.iterateEntries(filterOptions)) {
    if (limit && processed >= limit) break;

    processed++;

    const total = limit ?? totalCount;
    const percent = Math.floor((processed / total) * 100);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = elapsed > 0 ? Math.floor(processed / elapsed) : 0;

    if (options.verbose) {
      console.log(`[${processed}/${total}] (${percent}%) Processing: ${entry.name}`);
    } else {
      // Update progress every 1% or every 100 entries, whichever comes first
      const prevPercent = Math.floor(((processed - 1) / total) * 100);
      if (percent !== prevPercent || processed % 100 === 0 || processed === total) {
        process.stdout.write(`\rProgress: ${processed.toLocaleString()}/${total.toLocaleString()} (${percent}%) - ${rate}/sec    `);
      }
    }

    try {
      // Extract content
      const content = await format.extractContent(entry);
      if (!content) {
        if (options.verbose) {
          console.log(`  -> No content found`);
        }
        failed++;
        continue;
      }

      // Generate markdown
      const markdown = generateMarkdown(content, generator);

      // Write file based on format type
      let filePath: string;

      if (format.supportsMultipleLanguages() && entry.language) {
        // Apple format: Language/Framework/Item.md
        filePath = writeAppleEntry(
          outputDir,
          entry,
          content,
          markdown,
          createdDirs
        );
      } else {
        // Generic format: Type/Item.md
        filePath = writeGenericEntry(
          outputDir,
          entry,
          content,
          markdown,
          createdDirs
        );
      }

      filesWritten++;
      bytesWritten += Buffer.byteLength(markdown, 'utf-8');

      // Track for index generation
      trackForIndex(entry, content, filePath, outputDir, typeItems, frameworkItems, seenEntries, format);

      successful++;
    } catch (error) {
      if (options.verbose) {
        console.error(`  -> Error: ${error}`);
      }
      failed++;
    }
  }

  // Clear progress line and generate index files
  if (!options.verbose) {
    process.stdout.write('\n');
  }
  console.log('Generating index files...');

  if (format.supportsMultipleLanguages()) {
    generateAppleIndexes(outputDir, frameworkItems, generator, createdDirs);
  } else {
    generateGenericIndexes(outputDir, typeItems, generator, basename(resolvedPath), createdDirs);
  }

  // Print summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n=== Conversion Complete ===');
  console.log(`Format: ${format.getName()}`);
  console.log(`Time: ${elapsed}s`);
  console.log(`Entries processed: ${processed.toLocaleString()}`);
  console.log(`Successful: ${successful.toLocaleString()}`);
  console.log(`Failed: ${failed.toLocaleString()}`);
  console.log(`Files written: ${filesWritten.toLocaleString()}`);
  console.log(`Directories created: ${createdDirs.size}`);
  console.log(`Total size: ${(bytesWritten / 1024 / 1024).toFixed(1)} MB`);

  // Run link validation if requested
  if (options.validate) {
    const validationResults = validateLinks(outputDir, options.verbose ?? false);
    printValidationResults(validationResults);
  }

  // Cleanup
  format.close();
}

/**
 * Generate markdown string from parsed content.
 *
 * Converts ParsedContent to ParsedDocumentation format expected by
 * MarkdownGenerator, then generates the markdown output.
 *
 * @param content - Parsed content from format handler
 * @param generator - MarkdownGenerator instance
 * @returns Markdown string
 */
function generateMarkdown(content: ParsedContent, generator: MarkdownGenerator): string {
  // Convert ParsedContent to ParsedDocumentation for the generator
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
 * Convert ContentItem to TopicItem format.
 * @param item - Content item to convert
 * @returns TopicItem for use in MarkdownGenerator
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
 * Sanitize a string for use as a filename.
 *
 * Removes/replaces invalid characters, truncates long names, and
 * converts method signatures to unique filenames.
 *
 * @param name - Raw name to sanitize
 * @returns Safe filename string
 */
function sanitizeFileName(name: string): string {
  let sanitized = name;

  // Handle method signatures: convert parameters to underscore-separated format
  // e.g., init(frame:) → init_frame, perform(_:with:afterDelay:) → perform_with_afterdelay
  if (sanitized.includes('(')) {
    const parenIndex = sanitized.indexOf('(');
    const methodName = sanitized.substring(0, parenIndex);
    const paramsSection = sanitized.substring(parenIndex);

    // Extract parameter labels from signature
    const paramLabels = paramsSection
      .replace(/[()]/g, '')  // Remove parentheses
      .split(':')            // Split by colons
      .map(p => p.trim().split(/\s+/).pop() || '')  // Get the label (last word before colon)
      .filter(p => p && p !== '_')  // Remove empty and underscore-only labels
      .join('_');

    sanitized = paramLabels ? `${methodName}_${paramLabels}` : methodName;
  }

  sanitized = sanitized
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/__+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }

  // Lowercase for case-insensitive consistency across filesystems
  return (sanitized || 'unnamed').toLowerCase();
}

/**
 * Normalize type name to lowercase for consistent directory naming.
 * @param type - Type name to normalize
 * @returns Lowercase type name
 */
function normalizeType(type: string): string {
  return type.toLowerCase();
}

/**
 * Write an Apple docset entry to the output directory.
 *
 * Apple entries are organized by Language/Framework/Item.md structure.
 *
 * @param outputDir - Base output directory
 * @param entry - Normalized entry to write
 * @param content - Parsed content
 * @param markdown - Generated markdown content
 * @param createdDirs - Set tracking created directories
 * @returns Full path to the written file
 */
function writeAppleEntry(
  outputDir: string,
  entry: NormalizedEntry,
  content: ParsedContent,
  markdown: string,
  createdDirs: Set<string>
): string {
  // Use lowercase for all directory names for consistency
  const langDir = entry.language === 'swift' ? 'swift' : 'objective-c';
  const framework = (content.framework || 'other').toLowerCase();

  // Build path from entry.path (request key)
  const match = entry.path.match(/l[sc]\/documentation\/(.+)/);
  let filePath: string;

  if (match) {
    const docPath = match[1];
    const parts = docPath.split('/').map(p => p.toLowerCase());

    if (parts.length === 1) {
      filePath = join(outputDir, langDir, parts[0], '_index.md');
    } else {
      const dirParts = parts.slice(0, -1);
      // Use URL path segment for filename to match link generation in DocCParser
      const fileName = sanitizeFileName(parts[parts.length - 1]) + '.md';
      filePath = join(outputDir, langDir, ...dirParts, fileName);
    }
  } else {
    filePath = join(outputDir, langDir, framework, sanitizeFileName(entry.name) + '.md');
  }

  ensureDir(dirname(filePath), createdDirs);
  writeFileSync(filePath, markdown, 'utf-8');

  return filePath;
}

/**
 * Write a generic docset entry to the output directory.
 *
 * Generic entries are organized by Type/Item.md structure.
 *
 * @param outputDir - Base output directory
 * @param entry - Normalized entry to write
 * @param content - Parsed content
 * @param markdown - Generated markdown content
 * @param createdDirs - Set tracking created directories
 * @returns Full path to the written file
 */
function writeGenericEntry(
  outputDir: string,
  entry: NormalizedEntry,
  content: ParsedContent,
  markdown: string,
  createdDirs: Set<string>
): string {
  // Generic format: type/name.md (all lowercase)
  const typeDir = normalizeType(entry.type);
  const fileName = sanitizeFileName(entry.name) + '.md';
  const filePath = join(outputDir, typeDir, fileName);

  ensureDir(dirname(filePath), createdDirs);
  writeFileSync(filePath, markdown, 'utf-8');

  return filePath;
}

/**
 * Ensure a directory exists, creating it if necessary.
 * @param dir - Directory path to ensure exists
 * @param createdDirs - Set to track which directories have been created
 */
function ensureDir(dir: string, createdDirs: Set<string>): void {
  if (!createdDirs.has(dir)) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    createdDirs.add(dir);
  }
}

/**
 * Track an entry for index file generation.
 *
 * Collects items by type (for generic docsets) or by framework and language
 * (for Apple docsets) for use when generating index files.
 *
 * @param entry - Entry being processed
 * @param content - Parsed content
 * @param filePath - Output file path
 * @param outputDir - Base output directory
 * @param typeItems - Map of type to items (generic docsets)
 * @param frameworkItems - Map of framework to language to items (Apple docsets)
 * @param seenEntries - Set of seen entry keys to avoid duplicates
 * @param format - Format handler
 */
function trackForIndex(
  entry: NormalizedEntry,
  content: ParsedContent,
  filePath: string,
  outputDir: string,
  typeItems: Map<string, ContentItem[]>,
  frameworkItems: Map<string, Map<string, ContentItem[]>>,
  seenEntries: Set<string>,
  format: DocsetFormat
): void {
  const key = `${entry.type}:${entry.name}:${entry.language || ''}`;
  if (seenEntries.has(key)) return;
  seenEntries.add(key);

  // Calculate relative URL from the type/framework index
  // For Apple docsets, derive URL from path to handle nested types correctly
  // e.g., path "ls/documentation/xpc/xpclistener/incomingsessionrequest" -> "./xpclistener/incomingsessionrequest.md"
  let relativeUrl: string;
  const pathMatch = entry.path.match(/l[sc]\/documentation\/[^/]+\/(.+)/);
  if (pathMatch) {
    // Use path-based URL for Apple docsets (handles nested types with slashes)
    relativeUrl = `./${pathMatch[1].toLowerCase()}.md`;
  } else {
    // Fallback for non-Apple docsets
    relativeUrl = `./${sanitizeFileName(entry.name)}.md`;
  }

  const item: ContentItem = {
    title: entry.name,
    url: relativeUrl,
    abstract: content.abstract,
    deprecated: content.deprecated,
    beta: content.beta,
  };

  if (format.supportsMultipleLanguages() && entry.language) {
    // Track by framework and language (all lowercase)
    let framework = (content.framework || 'other').toLowerCase();
    const pathMatch = entry.path.match(/l[sc]\/documentation\/([^/]+)/);
    if (pathMatch) {
      framework = pathMatch[1].toLowerCase();
    }
    if (!frameworkItems.has(framework)) {
      frameworkItems.set(framework, new Map());
    }
    const langItems = frameworkItems.get(framework)!;
    const lang = entry.language;
    if (!langItems.has(lang)) {
      langItems.set(lang, []);
    }

    // Only add top-level items (exclude 'Framework' as it's represented by _index.md)
    if (['Class', 'Struct', 'Protocol', 'Enum'].includes(entry.type)) {
      langItems.get(lang)!.push(item);
    }
  } else {
    // Track by type (lowercase)
    const type = normalizeType(entry.type);
    if (!typeItems.has(type)) {
      typeItems.set(type, []);
    }
    typeItems.get(type)!.push(item);
  }
}

/**
 * Generate index files for Apple docsets.
 *
 * Creates _index.md files for each framework and language root.
 *
 * @param outputDir - Base output directory
 * @param frameworkItems - Map of framework to language to items
 * @param generator - MarkdownGenerator instance
 * @param createdDirs - Set tracking created directories
 */
function generateAppleIndexes(
  outputDir: string,
  frameworkItems: Map<string, Map<string, ContentItem[]>>,
  generator: MarkdownGenerator,
  createdDirs: Set<string>
): void {
  // Generate framework indexes (all lowercase paths)
  for (const [framework, langItems] of frameworkItems) {
    for (const [lang, items] of langItems) {
      if (items.length === 0) continue;

      const langDir = lang === 'swift' ? 'swift' : 'objective-c';
      const indexContent = generator.generateIndex(
        framework,
        `Documentation for the ${framework} framework.`,
        items.sort((a, b) => a.title.localeCompare(b.title)).map(convertToTopicItem)
      );

      const indexPath = join(outputDir, langDir, framework, '_index.md');
      ensureDir(dirname(indexPath), createdDirs);
      writeFileSync(indexPath, indexContent, 'utf-8');
    }
  }

  // Generate language indexes
  for (const lang of ['swift', 'objc'] as const) {
    const langDir = lang === 'swift' ? 'swift' : 'objective-c';
    const frameworks = Array.from(frameworkItems.keys())
      .filter(fw => frameworkItems.get(fw)?.has(lang))
      .sort()
      .map(fw => ({
        title: fw,
        url: `./${fw}/_index.md`,
      }));

    if (frameworks.length === 0) continue;

    const langTitle = lang === 'swift' ? 'Swift' : 'Objective-C';
    const indexContent = generator.generateIndex(
      `${langTitle} Documentation`,
      `API documentation in ${langTitle}.`,
      frameworks.map(convertToTopicItem)
    );

    const indexPath = join(outputDir, langDir, '_index.md');
    ensureDir(dirname(indexPath), createdDirs);
    writeFileSync(indexPath, indexContent, 'utf-8');
  }
}

/**
 * Generate index files for generic docsets.
 *
 * Creates _index.md files for each type and a root index.
 *
 * @param outputDir - Base output directory
 * @param typeItems - Map of type to items
 * @param generator - MarkdownGenerator instance
 * @param docsetName - Name of the docset for the root index title
 * @param createdDirs - Set tracking created directories
 */
function generateGenericIndexes(
  outputDir: string,
  typeItems: Map<string, ContentItem[]>,
  generator: MarkdownGenerator,
  docsetName: string,
  createdDirs: Set<string>
): void {
  // Generate type indexes (all lowercase paths)
  for (const [type, items] of typeItems) {
    if (items.length === 0) continue;

    const indexContent = generator.generateIndex(
      type,
      `${type} entries.`,
      items.sort((a, b) => a.title.localeCompare(b.title)).map(convertToTopicItem)
    );

    const indexPath = join(outputDir, type, '_index.md');
    ensureDir(dirname(indexPath), createdDirs);
    writeFileSync(indexPath, indexContent, 'utf-8');
  }

  // Generate root index
  const types = Array.from(typeItems.keys())
    .filter(t => typeItems.get(t)!.length > 0)
    .sort()
    .map(t => ({
      title: `${t} (${typeItems.get(t)!.length})`,
      url: `./${t}/_index.md`,
    }));

  if (types.length > 0) {
    const rootIndex = generator.generateIndex(
      docsetName.replace('.docset', ''),
      'Documentation index.',
      types.map(convertToTopicItem)
    );

    const rootPath = join(outputDir, '_index.md');
    writeFileSync(rootPath, rootIndex, 'utf-8');
  }
}

/**
 * List all entry types in a docset.
 *
 * Displays each type and its entry count.
 *
 * @param docsetPath - Path to the .docset directory
 */
async function listTypes(docsetPath: string) {
  const resolvedPath = resolve(docsetPath);

  if (!existsSync(resolvedPath)) {
    console.error(`Error: Docset not found at ${resolvedPath}`);
    process.exit(1);
  }

  const registry = new FormatRegistry();
  const format = await registry.detectFormat(resolvedPath);

  if (!format) {
    console.error('Error: Unsupported docset format');
    process.exit(1);
  }

  console.log(`Format: ${format.getName()}`);
  console.log('Entry types in docset:');

  const types = format.getTypes();
  for (const type of types) {
    const count = format.getEntryCount({ types: [type] });
    console.log(`  ${type}: ${count.toLocaleString()}`);
  }

  format.close();
}

/**
 * List all frameworks/categories in a docset.
 *
 * @param docsetPath - Path to the .docset directory
 */
async function listFrameworks(docsetPath: string) {
  const resolvedPath = resolve(docsetPath);

  if (!existsSync(resolvedPath)) {
    console.error(`Error: Docset not found at ${resolvedPath}`);
    process.exit(1);
  }

  const registry = new FormatRegistry();
  const format = await registry.detectFormat(resolvedPath);

  if (!format) {
    console.error('Error: Unsupported docset format');
    process.exit(1);
  }

  console.log(`Format: ${format.getName()}`);

  const categories = format.getCategories();
  if (categories.length === 0) {
    console.log('No frameworks/categories in this docset.');
  } else {
    console.log(`Frameworks/Categories (${categories.length}):`);
    for (const cat of categories) {
      console.log(`  ${cat}`);
    }
  }

  format.close();
}

/**
 * Show information about a docset.
 *
 * Displays format, entry count, frameworks, languages, and type breakdown.
 *
 * @param docsetPath - Path to the .docset directory
 */
async function showInfo(docsetPath: string) {
  const resolvedPath = resolve(docsetPath);

  if (!existsSync(resolvedPath)) {
    console.error(`Error: Docset not found at ${resolvedPath}`);
    process.exit(1);
  }

  const registry = new FormatRegistry();
  const format = await registry.detectFormat(resolvedPath);

  if (!format) {
    console.error('Error: Unsupported docset format');
    process.exit(1);
  }

  console.log(`Docset: ${basename(resolvedPath)}`);
  console.log(`Path: ${resolvedPath}`);
  console.log(`Format: ${format.getName()}`);
  console.log('');

  console.log(`Total entries: ${format.getEntryCount().toLocaleString()}`);

  const categories = format.getCategories();
  if (categories.length > 0) {
    console.log(`Frameworks/Categories: ${categories.length}`);
  }

  if (format.supportsMultipleLanguages()) {
    console.log(`Languages: ${format.getLanguages().join(', ')}`);
  }

  console.log('');
  console.log('Entry types:');
  for (const type of format.getTypes()) {
    const count = format.getEntryCount({ types: [type] });
    console.log(`  ${type}: ${count.toLocaleString()}`);
  }

  format.close();
}

main().catch(console.error);
