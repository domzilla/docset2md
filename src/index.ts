#!/usr/bin/env node

import { program } from 'commander';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename, join, dirname } from 'node:path';
import { FormatRegistry } from './formats/FormatRegistry.js';
import { MarkdownGenerator } from './generator/MarkdownGenerator.js';
import type { DocsetFormat, NormalizedEntry, ParsedContent, ContentItem } from './formats/types.js';
import type { TopicItem, ParsedDocumentation } from './parser/types.js';

interface ConvertOptions {
  output: string;
  language?: 'swift' | 'objc' | 'both';
  framework?: string[];
  type?: string[];
  limit?: number;
  verbose?: boolean;
}

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

async function convert(docsetPath: string, options: ConvertOptions) {
  const resolvedPath = resolve(docsetPath);

  // Validate docset exists
  if (!existsSync(resolvedPath)) {
    console.error(`Error: Docset not found at ${resolvedPath}`);
    process.exit(1);
  }

  // Detect format
  const registry = new FormatRegistry();
  const format = await registry.detectFormat(resolvedPath);

  if (!format) {
    console.error('Error: Unsupported docset format');
    console.error('Supported formats: Apple DocC, Standard Dash, CoreData');
    process.exit(1);
  }

  console.log(`Detected format: ${format.getName()}`);
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

    if (options.verbose) {
      console.log(`[${processed}/${limit ?? totalCount}] Processing: ${entry.name}`);
    } else if (processed % 1000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = (processed / parseFloat(elapsed)).toFixed(0);
      console.log(`Progress: ${processed.toLocaleString()}/${(limit ?? totalCount).toLocaleString()} (${rate}/sec)`);
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

  // Generate index files
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

  // Cleanup
  format.close();
}

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

function capitalizeType(type: string): string {
  // Capitalize first letter
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function writeAppleEntry(
  outputDir: string,
  entry: NormalizedEntry,
  content: ParsedContent,
  markdown: string,
  createdDirs: Set<string>
): string {
  const langDir = entry.language === 'swift' ? 'Swift' : 'Objective-C';
  const framework = content.framework || 'Other';

  // Build path from entry.path (request key)
  const match = entry.path.match(/l[sc]\/documentation\/(.+)/);
  let filePath: string;

  if (match) {
    const docPath = match[1];
    const parts = docPath.split('/');

    // Capitalize framework name
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

  ensureDir(dirname(filePath), createdDirs);
  writeFileSync(filePath, markdown, 'utf-8');

  return filePath;
}

function writeGenericEntry(
  outputDir: string,
  entry: NormalizedEntry,
  content: ParsedContent,
  markdown: string,
  createdDirs: Set<string>
): string {
  // Generic format: Type/Name.md
  const typeDir = capitalizeType(entry.type);
  const fileName = sanitizeFileName(entry.name) + '.md';
  const filePath = join(outputDir, typeDir, fileName);

  ensureDir(dirname(filePath), createdDirs);
  writeFileSync(filePath, markdown, 'utf-8');

  return filePath;
}

function ensureDir(dir: string, createdDirs: Set<string>): void {
  if (!createdDirs.has(dir)) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    createdDirs.add(dir);
  }
}

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
  const relativeUrl = `./${sanitizeFileName(entry.name)}.md`;

  const item: ContentItem = {
    title: entry.name,
    url: relativeUrl,
    abstract: content.abstract,
    deprecated: content.deprecated,
    beta: content.beta,
  };

  if (format.supportsMultipleLanguages() && entry.language) {
    // Track by framework and language
    const framework = content.framework || 'Other';
    if (!frameworkItems.has(framework)) {
      frameworkItems.set(framework, new Map());
    }
    const langItems = frameworkItems.get(framework)!;
    const lang = entry.language;
    if (!langItems.has(lang)) {
      langItems.set(lang, []);
    }

    // Only add top-level items
    if (['Class', 'Struct', 'Protocol', 'Enum', 'Framework'].includes(entry.type)) {
      langItems.get(lang)!.push(item);
    }
  } else {
    // Track by type
    const type = capitalizeType(entry.type);
    if (!typeItems.has(type)) {
      typeItems.set(type, []);
    }
    typeItems.get(type)!.push(item);
  }
}

function generateAppleIndexes(
  outputDir: string,
  frameworkItems: Map<string, Map<string, ContentItem[]>>,
  generator: MarkdownGenerator,
  createdDirs: Set<string>
): void {
  // Generate framework indexes
  for (const [framework, langItems] of frameworkItems) {
    for (const [lang, items] of langItems) {
      if (items.length === 0) continue;

      const langDir = lang === 'swift' ? 'Swift' : 'Objective-C';
      const indexContent = generator.generateIndex(
        framework,
        `Documentation for the ${framework} framework.`,
        items.sort((a, b) => a.title.localeCompare(b.title)).map(convertToTopicItem)
      );

      const indexPath = join(outputDir, langDir, capitalizeFramework(framework.toLowerCase()), '_index.md');
      ensureDir(dirname(indexPath), createdDirs);
      writeFileSync(indexPath, indexContent, 'utf-8');
    }
  }

  // Generate language indexes
  for (const lang of ['swift', 'objc'] as const) {
    const langDir = lang === 'swift' ? 'Swift' : 'Objective-C';
    const frameworks = Array.from(frameworkItems.keys())
      .filter(fw => frameworkItems.get(fw)?.has(lang))
      .sort()
      .map(fw => ({
        title: fw,
        url: `./${capitalizeFramework(fw.toLowerCase())}/_index.md`,
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

function generateGenericIndexes(
  outputDir: string,
  typeItems: Map<string, ContentItem[]>,
  generator: MarkdownGenerator,
  docsetName: string,
  createdDirs: Set<string>
): void {
  // Generate type indexes
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
