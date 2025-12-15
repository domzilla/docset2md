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
 */

import { createCli } from './cli-core.js';

createCli({
    name: 'Apple DocC documentation',
    description: 'Full-text search across Apple developer documentation converted from DocC\n  format. Uses SQLite FTS5 with BM25 ranking for relevance scoring.',
    supportsLanguage: true,
    typeExamples: 'Class, Struct, Protocol, Method, Property, Enum, Function, Framework',
    frameworkExamples: 'framework (e.g., UIKit, Foundation, SwiftUI)',
    examples: {
        basicSearches: [
            './search UIWindow',
            './search "table view"',
            './search view*',
        ],
        filteredSearches: [
            './search window --type Class',
            './search "view*" --type Class --framework UIKit',
            './search init --language swift',
            './search delegate --type Protocol --language objc',
        ],
        booleanQueries: [
            './search "view AND controller"',
            './search "button OR label" --type Class',
            './search "view NOT controller" --framework UIKit',
        ],
    },
});
