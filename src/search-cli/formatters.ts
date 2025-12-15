/**
 * @file formatters.ts
 * @module search-cli/formatters
 * @author Dominic Rodemer
 * @created 2025-12-14
 * @license MIT
 *
 * @fileoverview Output formatters for search results.
 */

import type { SearchResult } from './search-index-reader.js';

/**
 * Output format type.
 */
export type OutputFormat = 'simple' | 'table' | 'json';

/**
 * Format search results for output.
 *
 * @param results - Search results to format
 * @param format - Output format
 * @param query - Original search query
 * @returns Formatted string output
 */
export function formatResults(
    results: SearchResult[],
    format: OutputFormat,
    query: string
): string {
    switch (format) {
        case 'json':
            return formatJson(results, query);
        case 'table':
            return formatTable(results);
        case 'simple':
        default:
            return formatSimple(results);
    }
}

/**
 * Format results as simple text.
 */
function formatSimple(results: SearchResult[]): string {
    if (results.length === 0) {
        return 'No results found.';
    }

    const lines: string[] = [];

    for (const result of results) {
        // Status markers
        const markers: string[] = [];
        if (result.deprecated) markers.push('Deprecated');
        if (result.beta) markers.push('Beta');
        const status = markers.length > 0 ? ` *${markers.join(', ')}*` : '';

        // Framework info
        const framework = result.framework ? ` (${result.framework})` : '';

        // Main line
        lines.push(`[${result.type}] ${result.name}${framework}${status}`);

        // Path
        lines.push(`  Path: ${result.path}`);

        // Abstract if present
        if (result.abstract) {
            // Truncate long abstracts
            const abstract = result.abstract.length > 100
                ? result.abstract.substring(0, 100) + '...'
                : result.abstract;
            lines.push(`  ${abstract}`);
        }

        lines.push(''); // Empty line between results
    }

    return lines.join('\n').trim();
}

/**
 * Format results as a table.
 */
function formatTable(results: SearchResult[]): string {
    if (results.length === 0) {
        return 'No results found.';
    }

    // Calculate column widths
    const nameWidth = Math.min(30, Math.max(4, ...results.map(r => r.name.length)));
    const typeWidth = Math.max(4, ...results.map(r => r.type.length));
    const frameworkWidth = Math.max(9, ...results.map(r => (r.framework || '').length));
    const pathWidth = Math.min(50, Math.max(4, ...results.map(r => r.path.length)));

    // Header
    const header = [
        'Name'.padEnd(nameWidth),
        'Type'.padEnd(typeWidth),
        'Framework'.padEnd(frameworkWidth),
        'Path'.padEnd(pathWidth),
    ].join(' | ');

    const separator = [
        '-'.repeat(nameWidth),
        '-'.repeat(typeWidth),
        '-'.repeat(frameworkWidth),
        '-'.repeat(pathWidth),
    ].join('-+-');

    // Rows
    const rows = results.map(r => {
        const name = r.name.length > nameWidth
            ? r.name.substring(0, nameWidth - 3) + '...'
            : r.name.padEnd(nameWidth);
        const path = r.path.length > pathWidth
            ? r.path.substring(0, pathWidth - 3) + '...'
            : r.path.padEnd(pathWidth);

        return [
            name,
            r.type.padEnd(typeWidth),
            (r.framework || '').padEnd(frameworkWidth),
            path,
        ].join(' | ');
    });

    return [header, separator, ...rows].join('\n');
}

/**
 * Format results as JSON.
 */
function formatJson(results: SearchResult[], query: string): string {
    const output = {
        query,
        total: results.length,
        results: results.map(r => ({
            id: r.id,
            name: r.name,
            type: r.type,
            language: r.language,
            framework: r.framework,
            path: r.path,
            abstract: r.abstract,
            deprecated: r.deprecated,
            beta: r.beta,
            score: r.score,
        })),
    };

    return JSON.stringify(output, null, 2);
}

/**
 * Format types/frameworks list.
 */
export function formatList(
    items: Array<{ name: string; count: number }>,
    title: string
): string {
    if (items.length === 0) {
        return `No ${title.toLowerCase()} found.`;
    }

    const lines = [`${title}:`];
    for (const item of items) {
        lines.push(`  ${item.name} (${item.count.toLocaleString()})`);
    }

    return lines.join('\n');
}
