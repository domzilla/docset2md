/**
 * @file cli-core.ts
 * @module search-cli/cli-core
 * @author Dominic Rodemer
 * @created 2025-12-15
 * @license MIT
 *
 * @fileoverview Shared CLI implementation for search variants.
 * Provides configuration-driven CLI functionality used by both
 * docc-search and standard-search entry points.
 */

import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { SearchIndexReader } from './search-index-reader.js';
import { formatResults, formatList, type OutputFormat } from './formatters.js';
import { buildHelpText } from './help.js';

/**
 * Examples for the help text.
 */
export interface HelpExamples {
    /** Basic search examples */
    basicSearches: string[];
    /** Filtered search examples */
    filteredSearches: string[];
    /** Boolean query examples */
    booleanQueries: string[];
}

/**
 * Configuration for a search CLI variant.
 */
export interface CliConfig {
    /** Name shown in help (e.g., "Apple DocC documentation") */
    name: string;
    /** Description line in help */
    description: string;
    /** Whether to enable --language flag and --list-languages */
    supportsLanguage: boolean;
    /** Type examples for help (e.g., "Class, Struct, Protocol") */
    typeExamples: string;
    /** Framework description for help (e.g., "UIKit, Foundation") */
    frameworkExamples: string;
    /** Variant-specific examples */
    examples: HelpExamples;
}

/**
 * Parsed command-line arguments.
 */
interface ParsedArgs {
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
}

/**
 * Get the directory where this binary is located.
 * Used to find search.db in the same directory.
 */
function getBinaryDir(): string {
    return dirname(process.execPath);
}

/**
 * Parse command-line arguments.
 *
 * @param supportsLanguage - Whether to parse --language flag
 * @returns Parsed arguments
 */
function parseArgs(supportsLanguage: boolean): ParsedArgs {
    const args = process.argv.slice(2);
    const result: ParsedArgs = {
        query: undefined,
        dbPath: undefined,
        type: undefined,
        framework: undefined,
        language: undefined,
        limit: 20,
        format: 'simple',
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
        } else if ((arg === '--language' || arg === '-l') && supportsLanguage) {
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
        } else if (arg === '--list-languages' && supportsLanguage) {
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
 * Resolve the search.db path.
 * By default, looks in the same directory as the binary.
 *
 * @param customPath - Optional custom path from --db option
 * @returns Resolved path to search.db
 */
function resolveDbPath(customPath?: string): string {
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
 * Create and run a search CLI with the given configuration.
 *
 * @param config - CLI configuration
 */
export function createCli(config: CliConfig): void {
    const args = parseArgs(config.supportsLanguage);

    if (args.help) {
        console.log(buildHelpText(config));
        process.exit(0);
    }

    // For list commands, we don't need a query
    const needsQuery =
        !args.listTypes && !args.listFrameworks && !(config.supportsLanguage && args.listLanguages);

    if (needsQuery && !args.query) {
        console.log(buildHelpText(config));
        process.exit(1);
    }

    const dbPath = resolveDbPath(args.dbPath);
    const reader = new SearchIndexReader(dbPath);

    try {
        // List commands
        if (args.listTypes) {
            const types = reader.getTypes();
            console.log(
                formatList(
                    types.map(t => ({ name: t.type, count: t.count })),
                    'Entry Types'
                )
            );
            return;
        }

        if (args.listFrameworks) {
            const frameworks = reader.getFrameworks();
            console.log(
                formatList(
                    frameworks.map(f => ({ name: f.framework, count: f.count })),
                    'Frameworks'
                )
            );
            return;
        }

        if (config.supportsLanguage && args.listLanguages) {
            const languages = reader.getLanguages();
            console.log(
                formatList(
                    languages.map(l => ({ name: l.language, count: l.count })),
                    'Languages'
                )
            );
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
            language: config.supportsLanguage ? args.language : undefined,
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
