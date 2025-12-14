#!/usr/bin/env bun

/**
 * @file index.ts
 * @module search-cli
 * @author Dominic Rodemer
 * @created 2025-12-14
 * @license MIT
 *
 * @fileoverview CLI entry point for searching converted documentation.
 * The binary finds search.db in its own directory by default.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { SearchIndexReader } from './SearchIndexReader.js';
import { formatResults, formatList, type OutputFormat } from './formatters.js';

/**
 * Get the directory where this binary is located.
 * Used to find search.db in the same directory.
 */
function getBinaryDir(): string {
    // process.execPath gives the path to the executable
    return dirname(process.execPath);
}

/**
 * Parse command-line arguments.
 */
function parseArgs(): {
    query?: string;
    dbPath?: string;
    type?: string;
    framework?: string;
    language?: string;
    limit: number;
    format: OutputFormat;
    listTypes: boolean;
    listFrameworks: boolean;
    listLanguages: boolean;
    help: boolean;
} {
    const args = process.argv.slice(2);
    const result = {
        query: undefined as string | undefined,
        dbPath: undefined as string | undefined,
        type: undefined as string | undefined,
        framework: undefined as string | undefined,
        language: undefined as string | undefined,
        limit: 20,
        format: 'simple' as OutputFormat,
        listTypes: false,
        listFrameworks: false,
        listLanguages: false,
        help: false,
    };

    let i = 0;
    while (i < args.length) {
        const arg = args[i];

        if (arg === '--help' || arg === '-h') {
            result.help = true;
            i++;
        } else if (arg === '--db') {
            result.dbPath = args[++i];
            i++;
        } else if (arg === '--type' || arg === '-t') {
            result.type = args[++i];
            i++;
        } else if (arg === '--framework' || arg === '-f') {
            result.framework = args[++i];
            i++;
        } else if (arg === '--language' || arg === '-l') {
            result.language = args[++i];
            i++;
        } else if (arg === '--limit' || arg === '-n') {
            result.limit = parseInt(args[++i], 10);
            i++;
        } else if (arg === '--format') {
            result.format = args[++i] as OutputFormat;
            i++;
        } else if (arg === '--list-types') {
            result.listTypes = true;
            i++;
        } else if (arg === '--list-frameworks') {
            result.listFrameworks = true;
            i++;
        } else if (arg === '--list-languages') {
            result.listLanguages = true;
            i++;
        } else if (!arg.startsWith('-')) {
            // First positional argument is the query
            if (!result.query) {
                result.query = arg;
            }
            i++;
        } else {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
        }
    }

    return result;
}

/**
 * Print usage information.
 */
function printUsage(): void {
    console.log(`search - Search converted documentation

Usage:
  ./search <query> [options]
  ./search --list-types
  ./search --list-frameworks
  ./search --list-languages

The search binary automatically finds search.db in its own directory.

Arguments:
  query                 Search query (supports: prefix*, "exact phrase", AND/OR/NOT)

Options:
  -t, --type <type>     Filter by entry type (e.g., Class, Method, Property)
  -f, --framework <fw>  Filter by framework (e.g., UIKit, Foundation)
  -l, --language <lang> Filter by language (e.g., swift, objc)
  -n, --limit <n>       Maximum results (default: 20)
  --format <fmt>        Output format: simple, table, json (default: simple)
  --db <path>           Path to search.db (default: same directory as binary)

List Commands:
  --list-types          List all entry types in the index
  --list-frameworks     List all frameworks in the index
  --list-languages      List all languages in the index

Examples:
  ./search "UIWindow"
  ./search "window*" --type Class
  ./search "view" --framework UIKit --limit 10
  ./search "init*" --format json
  ./search --list-types
`);
}

/**
 * Resolve the search.db path.
 * By default, looks in the same directory as the binary.
 * Can be overridden with --db option.
 */
function resolveDbPath(customPath?: string): string {
    // If custom path provided, use it
    if (customPath) {
        const resolved = resolve(customPath);

        // Check if path is directly to search.db
        if (resolved.endsWith('search.db') && existsSync(resolved)) {
            return resolved;
        }

        // Check if it's a directory containing search.db
        const dbInDir = join(resolved, 'search.db');
        if (existsSync(dbInDir)) {
            return dbInDir;
        }

        console.error(`Error: search.db not found at ${resolved}`);
        process.exit(1);
    }

    // Default: look in the same directory as the binary
    const binaryDir = getBinaryDir();
    const dbPath = join(binaryDir, 'search.db');

    if (existsSync(dbPath)) {
        return dbPath;
    }

    console.error(`Error: search.db not found in ${binaryDir}`);
    console.error('Make sure the search binary is in the same directory as search.db.');
    console.error('Or use --db <path> to specify the database location.');
    process.exit(1);
}

/**
 * Main entry point.
 */
function main(): void {
    const args = parseArgs();

    if (args.help) {
        printUsage();
        process.exit(0);
    }

    // For list commands, we don't need a query
    const needsQuery = !args.listTypes && !args.listFrameworks && !args.listLanguages;

    if (needsQuery && !args.query) {
        printUsage();
        process.exit(1);
    }

    const dbPath = resolveDbPath(args.dbPath);
    const reader = new SearchIndexReader(dbPath);

    try {
        // List commands
        if (args.listTypes) {
            const types = reader.getTypes();
            console.log(formatList(
                types.map(t => ({ name: t.type, count: t.count })),
                'Entry Types'
            ));
            return;
        }

        if (args.listFrameworks) {
            const frameworks = reader.getFrameworks();
            console.log(formatList(
                frameworks.map(f => ({ name: f.framework, count: f.count })),
                'Frameworks'
            ));
            return;
        }

        if (args.listLanguages) {
            const languages = reader.getLanguages();
            console.log(formatList(
                languages.map(l => ({ name: l.language, count: l.count })),
                'Languages'
            ));
            return;
        }

        // Search command
        if (!args.query) {
            console.error('Error: Search query is required');
            console.error('Use --help for usage information');
            process.exit(1);
        }

        const results = reader.search(args.query, {
            type: args.type,
            framework: args.framework,
            language: args.language,
            limit: args.limit,
        });

        console.log(formatResults(results, args.format, args.query));

        // Show count hint if not JSON
        if (args.format !== 'json' && results.length === args.limit) {
            console.log(`\n(Showing first ${args.limit} results. Use --limit to see more.)`);
        }
    } finally {
        reader.close();
    }
}

main();
