#!/usr/bin/env bun

/**
 * @file standard-search.ts
 * @module search-cli/standard-search
 * @author Dominic Rodemer
 * @created 2025-12-14
 * @license MIT
 *
 * @fileoverview CLI entry point for searching Standard and CoreData docsets.
 * This variant does not include language filtering.
 */

import { createCli } from './cli-core.js';

createCli({
    name: 'documentation',
    description:
        'Full-text search across converted documentation.\n  Uses SQLite FTS5 with BM25 ranking for relevance scoring.',
    supportsLanguage: false,
    typeExamples: 'Function, Class, Method, Constant, Property, Type, Macro, Guide',
    frameworkExamples: 'framework or category name',
    examples: {
        basicSearches: ['./search array_map', './search "date time"', './search json*'],
        filteredSearches: [
            './search array --type Function',
            './search Date --type Class',
            './search "file*" --type Function --limit 50',
        ],
        booleanQueries: [
            './search "array AND sort"',
            './search "json OR xml" --type Function',
            './search "string NOT replace"',
        ],
    },
});
