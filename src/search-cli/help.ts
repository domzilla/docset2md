/**
 * @file help.ts
 * @module search-cli/help
 * @author Dominic Rodemer
 * @created 2025-12-15
 * @license MIT
 *
 * @fileoverview Shared help text sections for search CLI variants.
 */

import type { CliConfig } from './cli-core.js';

/**
 * Shared QUERY SYNTAX section - identical for all variants.
 */
export const QUERY_SYNTAX_SECTION = `QUERY SYNTAX
    The search uses SQLite FTS5 full-text search. Query terms are automatically
    escaped to prevent conflicts with FTS5 syntax (e.g., "and", "or" in text).

    Simple terms:
        <term>              Match entries containing the term
        term1 term2         Match entries containing all terms (implicit AND)

    Prefix matching:
        term*               Match entries starting with "term"
                                                Example: bookmark* matches bookmark, bookmarkData, etc.

    Phrase matching:
        "exact phrase"      Match exact phrase (words in order)
                                                Example: "table view" matches only "table view"

    Combined patterns:
        NSURL bookmark*     Match entries with "NSURL" AND starting with "bookmark"
        "in-app" purchase*  Match phrase "in-app" AND prefix "purchase*"`;

/**
 * Shared OUTPUT section - identical for all variants.
 */
export const OUTPUT_SECTION = `OUTPUT
    Results are ranked by relevance using BM25 scoring. Symbol names are
    weighted highest, followed by type, framework, description, and declaration.

    The path field shows the relative location of the markdown file containing
    the full documentation for each result.`;

/**
 * Build the complete help text for a CLI variant.
 *
 * @param config - CLI configuration with variant-specific settings
 * @returns Complete help text string
 */
export function buildHelpText(config: CliConfig): string {
    const listCommands = config.supportsLanguage
        ? `  --list-types          Show all entry types with counts
    --list-frameworks     Show all frameworks with counts
    --list-languages      Show all languages with counts`
        : `  --list-types          Show all entry types with counts
    --list-frameworks     Show all frameworks/categories with counts`;

    const usageLine = config.supportsLanguage
        ? `  ./search --list-types | --list-frameworks | --list-languages`
        : `  ./search --list-types | --list-frameworks`;

    const languageOption = config.supportsLanguage
        ? `  -l, --language <lang> Filter by programming language:
                                                    swift  - Swift documentation only
                                                    objc   - Objective-C documentation only
`
        : '';

    const examples = formatExamples(config);

    return `search - Search converted ${config.name}

USAGE
    ./search <query> [options]
${usageLine}

DESCRIPTION
    ${config.description}

    The search binary automatically finds search.db in its own directory.
    Use --db to specify an alternate location.

ARGUMENTS
    <query>               Search query using FTS5 syntax (see QUERY SYNTAX below)

OPTIONS
    -t, --type <type>     Filter by entry type (e.g., ${config.typeExamples})
    -f, --framework <fw>  Filter by ${config.frameworkExamples}
${languageOption}  -n, --limit <n>       Maximum number of results to return (default: 20)
    --format <fmt>        Output format:
                                                    simple - Human-readable text (default)
                                                    table  - Tabular format with columns
                                                    json   - JSON array for programmatic use
    --db <path>           Path to search.db file or directory containing it
    -h, --help            Show this help message

LIST COMMANDS
${listCommands}

${QUERY_SYNTAX_SECTION}

EXAMPLES
${examples}

${OUTPUT_SECTION}
`;
}

/**
 * Format the examples section from config.
 */
function formatExamples(config: CliConfig): string {
    const sections: string[] = [];

    if (config.examples.basicSearches.length > 0) {
        sections.push(`  Basic searches:
${config.examples.basicSearches.map(e => `    ${e}`).join('\n')}`);
    }

    if (config.examples.filteredSearches.length > 0) {
        sections.push(`  Filtered searches:
${config.examples.filteredSearches.map(e => `    ${e}`).join('\n')}`);
    }

    if (config.examples.booleanQueries.length > 0) {
        sections.push(`  Boolean queries:
${config.examples.booleanQueries.map(e => `    ${e}`).join('\n')}`);
    }

    // Add discovery examples
    const discovery = config.supportsLanguage
        ? ['./search --list-types', './search --list-frameworks', './search --list-languages']
        : ['./search --list-types', './search --list-frameworks'];

    sections.push(`  Discovery:
${discovery.map(e => `    ${e}`).join('\n')}`);

    return sections.join('\n\n');
}
