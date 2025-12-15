/**
 * @file PathResolver.ts
 * @module shared/PathResolver
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Converts request keys to file paths and handles filename sanitization.
 */

import { join, dirname, basename } from 'node:path';
import { sanitizeFileName } from './utils/sanitize.js';

/**
 * Resolves documentation paths to output file paths.
 *
 * Handles the conversion of DocC request keys (e.g., "ls/documentation/uikit/uiwindow")
 * to file system paths (e.g., "Swift/UIKit/UIWindow.md"). Also provides utilities
 * for calculating relative paths between documents for linking.
 *
 * @example
 * ```typescript
 * const resolver = new PathResolver('./output');
 * const filePath = resolver.resolveFilePath(
 *   'ls/documentation/uikit/uiwindow',
 *   'swift',
 *   'UIWindow'
 * );
 * // Returns: "./output/Swift/UIKit/UIWindow.md"
 * ```
 */
export class PathResolver {
    private outputDir: string;

    /**
     * Create a new PathResolver.
     * @param outputDir - Base directory for all output files
     */
    constructor(outputDir: string) {
        this.outputDir = outputDir;
    }

    /**
     * Convert a request key to an output file path.
     *
     * Parses the request key to extract the documentation path, applies
     * framework capitalization, and constructs the full output path.
     *
     * @param requestKey - DocC request key (e.g., "ls/documentation/uikit/uiwindow")
     * @param language - Target language ('swift' or 'objc')
     * @param name - Display name for the entry (used as filename)
     * @returns Full file path for the markdown output
     *
     * @example
     * ```typescript
     * resolver.resolveFilePath('ls/documentation/accelerate/vdsp', 'swift', 'vDSP');
     * // Returns: "./output/swift/accelerate/vdsp.md"
     * ```
     */
    resolveFilePath(requestKey: string, language: 'swift' | 'objc', name: string): string {
        // Use lowercase for all directory names
        const langDir = language === 'swift' ? 'swift' : 'objective-c';

        // Extract path after "documentation/"
        const match = requestKey.match(/l[sc]\/documentation\/(.+)/);
        if (!match) {
            return join(this.outputDir, langDir, this.sanitizeFileName(name) + '.md');
        }

        const docPath = match[1];
        const parts = docPath.split('/').map(p => p.toLowerCase());

        // Use the entry name for the filename (last part)
        const fileName = this.sanitizeFileName(name) + '.md';

        if (parts.length === 1) {
            // Framework root
            return join(this.outputDir, langDir, parts[0], '_index.md');
        }

        // Build path: framework/path/to/item.md (all lowercase)
        const dirParts = parts.slice(0, -1);
        return join(this.outputDir, langDir, ...dirParts, fileName);
    }

    /**
     * Resolve directory path for a framework.
     * @param framework - Framework name (will be lowercased)
     * @param language - Target language ('swift' or 'objc')
     * @returns Full directory path for the framework
     */
    resolveFrameworkDir(framework: string, language: 'swift' | 'objc'): string {
        const langDir = language === 'swift' ? 'swift' : 'objective-c';
        return join(this.outputDir, langDir, framework.toLowerCase());
    }

    /**
     * Get relative path from one document to another for linking.
     *
     * Calculates the relative path needed to link from one markdown file
     * to another, handling directory traversal correctly.
     *
     * @param fromPath - Path of the source document
     * @param toPath - Path of the target document
     * @returns Relative path string for use in markdown links
     *
     * @example
     * ```typescript
     * resolver.getRelativePath(
     *   './output/Swift/UIKit/UIWindow.md',
     *   './output/Swift/UIKit/UIView.md'
     * );
     * // Returns: "./UIView.md"
     * ```
     */
    getRelativePath(fromPath: string, toPath: string): string {
        const fromDir = dirname(fromPath);
        const toDir = dirname(toPath);

        if (fromDir === toDir) {
            return './' + basename(toPath);
        }

        // Calculate relative path
        const fromParts = fromDir.split('/').filter(p => p);
        const toParts = toDir.split('/').filter(p => p);

        let commonLength = 0;
        for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
            if (fromParts[i] === toParts[i]) {
                commonLength++;
            } else {
                break;
            }
        }

        const upCount = fromParts.length - commonLength;
        const downParts = toParts.slice(commonLength);

        const relativeParts = [...Array(upCount).fill('..'), ...downParts, basename(toPath)];

        return relativeParts.join('/');
    }

    /**
     * Sanitize a string for use as a filename.
     * @param name - Raw name to sanitize
     * @returns Safe filename string
     */
    sanitizeFileName(name: string): string {
        return sanitizeFileName(name);
    }
}
