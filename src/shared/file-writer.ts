/**
 * @file FileWriter.ts
 * @module shared/FileWriter
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Writes markdown files to output directory with statistics tracking.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PathResolver } from './path-resolver.js';

/**
 * Statistics about write operations.
 */
export interface WriteStats {
    /** Total number of files written */
    filesWritten: number;
    /** Total number of directories created */
    directoriesCreated: number;
    /** Total bytes written across all files */
    bytesWritten: number;
}

/**
 * Writes markdown documentation files to the output directory.
 *
 * Manages file and directory creation, tracks write statistics, and provides
 * convenient methods for writing documentation entries, framework indices,
 * and language root indices.
 *
 * @example
 * ```typescript
 * const writer = new FileWriter('./output');
 * writer.ensureOutputDirs();
 *
 * writer.writeEntry(
 *   'ls/documentation/uikit/uiwindow',
 *   'swift',
 *   'UIWindow',
 *   markdownContent
 * );
 *
 * console.log(writer.getStats());
 * // { filesWritten: 1, directoriesCreated: 2, bytesWritten: 1234 }
 * ```
 */
export class FileWriter {
    private pathResolver: PathResolver;
    private outputDir: string;
    private stats: WriteStats = {
        filesWritten: 0,
        directoriesCreated: 0,
        bytesWritten: 0,
    };
    private createdDirs: Set<string> = new Set();

    /**
     * Create a new FileWriter.
     * @param outputDir - Base directory for all output files
     */
    constructor(outputDir: string) {
        this.outputDir = outputDir;
        this.pathResolver = new PathResolver(outputDir);
    }

    /**
     * Write markdown content for a documentation entry.
     * @param requestKey - DocC request key (e.g., "ls/documentation/uikit/uiwindow")
     * @param language - Target language ('swift' or 'objc')
     * @param name - Display name for the entry (used as filename)
     * @param content - Markdown content to write
     * @returns Full path to the written file
     */
    writeEntry(
        requestKey: string,
        language: 'swift' | 'objc',
        name: string,
        content: string
    ): string {
        const filePath = this.pathResolver.resolveFilePath(requestKey, language, name);
        this.writeFile(filePath, content);
        return filePath;
    }

    /**
     * Write a framework index file.
     * @param framework - Framework name
     * @param language - Target language ('swift' or 'objc')
     * @param content - Markdown content for the index
     * @returns Full path to the written index file
     */
    writeFrameworkIndex(framework: string, language: 'swift' | 'objc', content: string): string {
        const dirPath = this.pathResolver.resolveFrameworkDir(framework, language);
        const filePath = join(dirPath, '_index.md');
        this.writeFile(filePath, content);
        return filePath;
    }

    /**
     * Write a root index file for a language.
     * @param language - Target language ('swift' or 'objc')
     * @param content - Markdown content for the language index
     * @returns Full path to the written index file
     */
    writeLanguageIndex(language: 'swift' | 'objc', content: string): string {
        const langDir = language === 'swift' ? 'swift' : 'objective-c';
        const filePath = join(this.outputDir, langDir, '_index.md');
        this.writeFile(filePath, content);
        return filePath;
    }

    /**
     * Write arbitrary file to the file system.
     *
     * Automatically creates parent directories if they don't exist.
     * Tracks write statistics (files, directories, bytes).
     *
     * @param filePath - Full path to the output file
     * @param content - Content to write
     */
    writeFile(filePath: string, content: string): void {
        const dir = dirname(filePath);

        // Create directory if needed
        if (!this.createdDirs.has(dir)) {
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
                this.stats.directoriesCreated++;
            }
            this.createdDirs.add(dir);
        }

        // Write file
        writeFileSync(filePath, content, 'utf-8');
        this.stats.filesWritten++;
        this.stats.bytesWritten += Buffer.byteLength(content, 'utf-8');
    }

    /**
     * Get the path resolver for manual path calculations.
     * @returns The PathResolver instance used by this writer
     */
    getPathResolver(): PathResolver {
        return this.pathResolver;
    }

    /**
     * Get write statistics.
     * @returns Copy of the current write statistics
     */
    getStats(): WriteStats {
        return { ...this.stats };
    }

    /**
     * Reset write statistics to zero.
     */
    resetStats(): void {
        this.stats = {
            filesWritten: 0,
            directoriesCreated: 0,
            bytesWritten: 0,
        };
    }

    /**
     * Ensure the base output directories for Swift and Objective-C exist.
     *
     * Creates the language root directories if they don't already exist.
     * Call this before writing any files.
     */
    ensureOutputDirs(): void {
        const swiftDir = join(this.outputDir, 'swift');
        const objcDir = join(this.outputDir, 'objective-c');

        for (const dir of [swiftDir, objcDir]) {
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
                this.stats.directoriesCreated++;
            }
            this.createdDirs.add(dir);
        }
    }
}
