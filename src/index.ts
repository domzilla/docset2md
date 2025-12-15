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

import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

import { program } from 'commander';

import { FormatDetector } from './factory/format-detector.js';
import { ConverterFactory } from './factory/converter-factory.js';
import { validateLinks, printValidationResults } from './shared/link-validator.js';
import type { NormalizedEntry } from './shared/formats/types.js';
import type { ProgressCallback } from './shared/converter/types.js';

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
    /** Generate searchable index (search.db) */
    index?: boolean;
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
        .option('--index', 'Generate searchable index (search.db)')
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
 * Main conversion command that detects the docset format, creates the
 * appropriate converter, and runs the conversion.
 *
 * @param docsetPath - Path to the .docset directory
 * @param options - Conversion options (output dir, filters, etc.)
 */
async function convert(docsetPath: string, options: ConvertOptions) {
    const resolvedPath = resolve(docsetPath);
    const docsetName = basename(resolvedPath).replace('.docset', '');

    // Validate docset exists
    if (!existsSync(resolvedPath)) {
        console.error(`Error: Docset not found at ${resolvedPath}`);
        process.exit(1);
    }

    // Detect format
    const registry = new FormatDetector();
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
    console.log(`Converting docset: ${docsetName}`);
    console.log(`Output directory: ${resolve(options.output)}`);

    // Create converter for this format
    const converter = ConverterFactory.createConverter(format, docsetName);

    // Build filter options
    const filters = {
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

    const totalCount = format.getEntryCount(filters);
    console.log(`Found ${totalCount.toLocaleString()} entries to process`);

    const startTime = Date.now();

    // Progress callback
    const onProgress: ProgressCallback = (current: number, total: number, entry: NormalizedEntry) => {
        const percent = Math.floor((current / total) * 100);
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = elapsed > 0 ? Math.floor(current / elapsed) : 0;

        if (options.verbose) {
            console.log(`[${current}/${total}] (${percent}%) Processing: ${entry.name}`);
        } else {
            const prevPercent = Math.floor(((current - 1) / total) * 100);
            if (percent !== prevPercent || current % 100 === 0 || current === total) {
                process.stdout.write(`\rProgress: ${current.toLocaleString()}/${total.toLocaleString()} (${percent}%) - ${rate}/sec    `);
            }
        }
    };

    // Run conversion
    const result = await converter.convert(
        {
            outputDir: resolve(options.output),
            verbose: options.verbose,
            filters,
            generateIndex: options.index,
        },
        onProgress
    );

    // Clear progress line
    if (!options.verbose) {
        process.stdout.write('\n');
    }

    // Print summary
    console.log('\n=== Conversion Complete ===');
    console.log(`Format: ${converter.getFormatName()}`);
    console.log(`Time: ${(result.elapsedMs / 1000).toFixed(1)}s`);
    console.log(`Entries processed: ${result.processed.toLocaleString()}`);
    console.log(`Successful: ${result.successful.toLocaleString()}`);
    console.log(`Failed: ${result.failed.toLocaleString()}`);
    console.log(`Files written: ${result.writeStats.filesWritten.toLocaleString()}`);
    console.log(`Directories created: ${result.writeStats.directoriesCreated}`);
    console.log(`Total size: ${(result.writeStats.bytesWritten / 1024 / 1024).toFixed(1)} MB`);
    if (result.indexEntries !== undefined) {
        console.log(`Search index: ${result.indexEntries.toLocaleString()} entries (search.db)`);
        if (result.searchBinaryBuilt) {
            console.log(`Search binary: ${resolve(options.output)}/search`);
        }
    }

    // Run link validation if requested
    if (options.validate) {
        const validationResults = validateLinks(resolve(options.output), options.verbose ?? false);
        printValidationResults(validationResults);
    }

    // Cleanup
    converter.close();
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

    const registry = new FormatDetector();
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

    const registry = new FormatDetector();
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

    const registry = new FormatDetector();
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
