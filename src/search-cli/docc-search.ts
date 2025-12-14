#!/usr/bin/env bun

/**
 * @file docc-search.ts
 * @module search-cli/docc-search
 * @author Dominic Rodemer
 * @created 2025-12-14
 * @license MIT
 *
 * @fileoverview CLI entry point for searching Apple DocC docsets.
 * This variant includes --language filtering for Swift/Objective-C.
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
    console.log(`search - Search converted Apple DocC documentation

USAGE
  ./search <query> [options]
  ./search --list-types | --list-frameworks | --list-languages

DESCRIPTION
  Full-text search across Apple developer documentation converted from DocC
  format. Uses SQLite FTS5 with BM25 ranking for relevance scoring.

  The search binary automatically finds search.db in its own directory.
  Use --db to specify an alternate location.

ARGUMENTS
  <query>               Search query using FTS5 syntax (see QUERY SYNTAX below)

OPTIONS
  -t, --type <type>     Filter by entry type (e.g., Class, Struct, Protocol,
                        Method, Property, Enum, Function, Framework)
  -f, --framework <fw>  Filter by framework (e.g., UIKit, Foundation, SwiftUI)
  -l, --language <lang> Filter by programming language:
                          swift  - Swift documentation only
                          objc   - Objective-C documentation only
  -n, --limit <n>       Maximum number of results to return (default: 20)
  --format <fmt>        Output format:
                          simple - Human-readable text (default)
                          table  - Tabular format with columns
                          json   - JSON array for programmatic use
  --db <path>           Path to search.db file or directory containing it
  -h, --help            Show this help message

LIST COMMANDS
  --list-types          Show all entry types with counts
  --list-frameworks     Show all frameworks with counts
  --list-languages      Show all languages with counts

QUERY SYNTAX
  The search uses SQLite FTS5 full-text search. Supported query patterns:

  Simple terms:
    UIWindow            Match entries containing "UIWindow"
    view controller     Match entries containing both "view" AND "controller"

  Prefix matching:
    view*               Match entries starting with "view" (view, viewController, ...)
    UI*                 Match entries starting with "UI" (UIKit, UIWindow, ...)

  Phrase matching:
    "view controller"   Match exact phrase "view controller"
    "init with"         Match exact phrase "init with"

  Boolean operators:
    view AND window     Both terms must be present
    view OR window      Either term can be present
    view NOT controller Match "view" but exclude "controller"
    (view OR window) AND controller
                        Combine operators with parentheses

  Column-specific search:
    name:UIWindow       Search only in symbol names
    abstract:manages    Search only in descriptions
    framework:UIKit     Search only in framework names

EXAMPLES
  Basic searches:
    ./search UIWindow
    ./search "table view"
    ./search view*

  Filtered searches:
    ./search window --type Class
    ./search "view*" --type Class --framework UIKit
    ./search init --language swift
    ./search delegate --type Protocol --language objc

  Output formats:
    ./search UIWindow --format json
    ./search view --format table --limit 50

  Boolean queries:
    ./search "view AND controller"
    ./search "button OR label" --type Class
    ./search "view NOT controller" --framework UIKit

  Discovery:
    ./search --list-types
    ./search --list-frameworks
    ./search --list-languages

OUTPUT
  Results are ranked by relevance using BM25 scoring. Symbol names are
  weighted highest, followed by type, framework, description, and declaration.

  The path field shows the relative location of the markdown file containing
  the full documentation for each result.
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
