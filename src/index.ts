#!/usr/bin/env node

import { program } from 'commander';
import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { IndexReader } from './db/IndexReader.js';
import { ContentExtractor } from './extractor/ContentExtractor.js';
import { DocCParser } from './parser/DocCParser.js';
import { MarkdownGenerator } from './generator/MarkdownGenerator.js';
import { FileWriter } from './writer/FileWriter.js';
import type { IndexEntry, TopicItem } from './parser/types.js';

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
    .description('Convert Apple Documentation docsets to Markdown')
    .version('1.0.0')
    .argument('<docset>', 'Path to the .docset directory')
    .option('-o, --output <dir>', 'Output directory', './output')
    .option('-l, --language <lang>', 'Language to export (swift, objc, both)', 'both')
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
    .description('List all frameworks in the docset')
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

  const indexPath = resolve(resolvedPath, 'Contents/Resources/docSet.dsidx');
  if (!existsSync(indexPath)) {
    console.error(`Error: Invalid docset - missing docSet.dsidx`);
    process.exit(1);
  }

  console.log(`Converting docset: ${basename(resolvedPath)}`);
  console.log(`Output directory: ${resolve(options.output)}`);

  // Initialize components
  const indexReader = new IndexReader(indexPath);
  const extractor = new ContentExtractor(resolvedPath);
  const parser = new DocCParser();
  const generator = new MarkdownGenerator();
  const writer = new FileWriter(resolve(options.output));

  // Determine which languages to process
  const languages: Array<'swift' | 'objc'> =
    options.language === 'swift'
      ? ['swift']
      : options.language === 'objc'
        ? ['objc']
        : ['swift', 'objc'];

  // Build filter options
  const filterOptions = {
    types: options.type,
    frameworks: options.framework,
    languages,
    limit: options.limit ? parseInt(String(options.limit)) : undefined,
  };

  // Get entry count
  const totalCount = indexReader.getCount(filterOptions);
  console.log(`Found ${totalCount.toLocaleString()} entries to process`);

  // Ensure output directories exist
  writer.ensureOutputDirs();

  // Track progress
  let processed = 0;
  let successful = 0;
  let failed = 0;
  const frameworkItems: Map<string, Map<'swift' | 'objc', TopicItem[]>> = new Map();
  const seenIndexEntries: Map<string, Set<string>> = new Map(); // framework -> Set of titles by lang

  // Process entries
  const startTime = Date.now();
  const limit = options.limit ? parseInt(String(options.limit)) : undefined;

  for (const entry of indexReader.iterateEntries(filterOptions)) {
    // Check limit
    if (limit && processed >= limit) {
      break;
    }

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
      const doc = extractor.extractByRequestKey(entry.requestKey);
      if (!doc) {
        if (options.verbose) {
          console.log(`  -> No content found`);
        }
        failed++;
        continue;
      }

      // Parse content
      const parsed = parser.parse(doc, entry.language);

      // Generate markdown
      const markdown = generator.generate(parsed);

      // Write file
      writer.writeEntry(entry.requestKey, entry.language, entry.name, markdown);

      // Track for index generation
      const framework = parsed.framework ?? 'Other';
      if (!frameworkItems.has(framework)) {
        frameworkItems.set(framework, new Map());
      }
      const langItems = frameworkItems.get(framework)!;
      if (!langItems.has(entry.language)) {
        langItems.set(entry.language, []);
      }

      // Only add top-level items to framework index (deduplicated)
      if (entry.type === 'Class' || entry.type === 'Struct' || entry.type === 'Protocol' || entry.type === 'Enum' || entry.type === 'Framework') {
        const seenKey = `${framework}:${entry.language}`;
        if (!seenIndexEntries.has(seenKey)) {
          seenIndexEntries.set(seenKey, new Set());
        }
        const seen = seenIndexEntries.get(seenKey)!;
        if (!seen.has(entry.name)) {
          seen.add(entry.name);
          langItems.get(entry.language)!.push({
            title: entry.name,
            url: `./${writer.getPathResolver().sanitizeFileName(entry.name)}.md`,
            abstract: parsed.abstract,
          });
        }
      }

      successful++;
    } catch (error) {
      if (options.verbose) {
        console.error(`  -> Error: ${error}`);
      }
      failed++;
    }
  }

  // Generate framework indexes
  console.log('Generating index files...');
  for (const [framework, langItems] of frameworkItems) {
    for (const [lang, items] of langItems) {
      if (items.length > 0) {
        const indexContent = generator.generateIndex(
          framework,
          `Documentation for the ${framework} framework.`,
          items.sort((a, b) => a.title.localeCompare(b.title))
        );
        writer.writeFrameworkIndex(framework.toLowerCase(), lang, indexContent);
      }
    }
  }

  // Generate language index files
  for (const lang of languages) {
    const frameworks = Array.from(frameworkItems.keys())
      .filter(fw => frameworkItems.get(fw)?.has(lang))
      .sort()
      .map(fw => ({
        title: fw,
        url: `./${fw}/_index.md`,
      }));

    if (frameworks.length > 0) {
      const langTitle = lang === 'swift' ? 'Swift' : 'Objective-C';
      const indexContent = generator.generateIndex(
        `${langTitle} Documentation`,
        `Apple API documentation in ${langTitle}.`,
        frameworks
      );
      writer.writeLanguageIndex(lang, indexContent);
    }
  }

  // Print summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const stats = writer.getStats();

  console.log('\n=== Conversion Complete ===');
  console.log(`Time: ${elapsed}s`);
  console.log(`Entries processed: ${processed.toLocaleString()}`);
  console.log(`Successful: ${successful.toLocaleString()}`);
  console.log(`Failed: ${failed.toLocaleString()}`);
  console.log(`Files written: ${stats.filesWritten.toLocaleString()}`);
  console.log(`Directories created: ${stats.directoriesCreated}`);
  console.log(`Total size: ${(stats.bytesWritten / 1024 / 1024).toFixed(1)} MB`);

  // Cleanup
  indexReader.close();
  extractor.close();
}

function listTypes(docsetPath: string) {
  const resolvedPath = resolve(docsetPath);
  const indexPath = resolve(resolvedPath, 'Contents/Resources/docSet.dsidx');

  if (!existsSync(indexPath)) {
    console.error(`Error: Invalid docset - missing docSet.dsidx`);
    process.exit(1);
  }

  const indexReader = new IndexReader(indexPath);
  const types = indexReader.getTypes();

  console.log('Entry types in docset:');
  for (const type of types) {
    const count = indexReader.getCount({ types: [type] });
    console.log(`  ${type}: ${count.toLocaleString()}`);
  }

  indexReader.close();
}

function listFrameworks(docsetPath: string) {
  const resolvedPath = resolve(docsetPath);
  const indexPath = resolve(resolvedPath, 'Contents/Resources/docSet.dsidx');

  if (!existsSync(indexPath)) {
    console.error(`Error: Invalid docset - missing docSet.dsidx`);
    process.exit(1);
  }

  const indexReader = new IndexReader(indexPath);
  const frameworks = indexReader.getFrameworks();

  console.log(`Frameworks in docset (${frameworks.length}):`);
  for (const fw of frameworks) {
    console.log(`  ${fw}`);
  }

  indexReader.close();
}

function showInfo(docsetPath: string) {
  const resolvedPath = resolve(docsetPath);

  if (!existsSync(resolvedPath)) {
    console.error(`Error: Docset not found at ${resolvedPath}`);
    process.exit(1);
  }

  const indexPath = resolve(resolvedPath, 'Contents/Resources/docSet.dsidx');
  if (!existsSync(indexPath)) {
    console.error(`Error: Invalid docset - missing docSet.dsidx`);
    process.exit(1);
  }

  const indexReader = new IndexReader(indexPath);

  console.log(`Docset: ${basename(resolvedPath)}`);
  console.log(`Path: ${resolvedPath}`);
  console.log('');
  console.log(`Total entries: ${indexReader.getCount().toLocaleString()}`);
  console.log(`Frameworks: ${indexReader.getFrameworks().length}`);
  console.log('');
  console.log('Entry types:');
  for (const type of indexReader.getTypes()) {
    const count = indexReader.getCount({ types: [type] });
    console.log(`  ${type}: ${count.toLocaleString()}`);
  }

  indexReader.close();
}

main().catch(console.error);
