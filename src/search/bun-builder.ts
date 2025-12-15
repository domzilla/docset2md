/**
 * @file BunBuilder.ts
 * @module search/BunBuilder
 * @author Dominic Rodemer
 * @created 2025-12-14
 * @license MIT
 *
 * @fileoverview Handles Bun detection and search binary compilation.
 */

import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Search binary variant to build.
 * - 'docc': DocC format with --language support for Swift/Objective-C
 * - 'standard': Standard/CoreData format without language filtering
 */
export type SearchBinaryVariant = 'docc' | 'standard';

/**
 * Check if Bun is installed on the system.
 * @returns true if Bun is available, false otherwise
 */
export function isBunInstalled(): boolean {
    try {
        execSync('bun --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Error thrown when Bun is not installed.
 */
export class BunNotInstalledError extends Error {
    constructor() {
        super('Bun is not installed');
        this.name = 'BunNotInstalledError';
    }
}

/**
 * Print instructions for installing Bun.
 */
export function printBunInstallInstructions(): void {
    console.error('\nError: Bun is required to build the search binary.');
    console.error('Install Bun with:');
    console.error('  curl -fsSL https://bun.sh/install | bash');
    console.error('\nAfter installing, run the conversion again with --index.');
    console.error('(search.db was created successfully and can be queried with any SQLite client)');
}

/**
 * Get the source directory for search CLI files.
 * When running from dist/, we need to resolve back to src/.
 */
function getSearchCliSourceDir(): string {
    // __dirname is dist/search/ when running compiled code
    // We need to find src/search-cli/ relative to project root
    let dir = __dirname;

    // If we're in dist/, go up and into src/
    if (dir.includes('/dist/') || dir.endsWith('/dist')) {
        dir = dir.replace('/dist/', '/src/').replace(/\/dist$/, '/src');
    }

    return join(dir, '../search-cli');
}

/**
 * Build the search binary and copy it to the output directory.
 *
 * @param outputDir - Directory where the binary should be placed
 * @param variant - Which search binary variant to build ('docc' or 'standard')
 * @returns true if binary was built successfully, false otherwise
 * @throws BunNotInstalledError if Bun is not installed
 */
export function buildSearchBinary(
    outputDir: string,
    variant: SearchBinaryVariant = 'standard'
): boolean {
    if (!isBunInstalled()) {
        throw new BunNotInstalledError();
    }

    // Path to the search CLI source based on variant
    const srcFile = variant === 'docc' ? 'docc-search.ts' : 'standard-search.ts';
    const srcPath = join(getSearchCliSourceDir(), srcFile);

    // Output binary path
    const outPath = join(outputDir, 'search');

    try {
        console.log(`Building search binary (${variant})...`);
        execSync(`bun build --compile --outfile="${outPath}" "${srcPath}"`, {
            stdio: 'inherit',
        });
        console.log(`Search binary created: ${outPath}`);
        return true;
    } catch (error) {
        console.error('Failed to build search binary:', error);
        return false;
    }
}
