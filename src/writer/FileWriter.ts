import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PathResolver } from './PathResolver.js';

export interface WriteStats {
  filesWritten: number;
  directoriesCreated: number;
  bytesWritten: number;
}

export class FileWriter {
  private pathResolver: PathResolver;
  private outputDir: string;
  private stats: WriteStats = {
    filesWritten: 0,
    directoriesCreated: 0,
    bytesWritten: 0,
  };
  private createdDirs: Set<string> = new Set();

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.pathResolver = new PathResolver(outputDir);
  }

  /**
   * Write markdown content for a documentation entry.
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
   */
  writeFrameworkIndex(framework: string, language: 'swift' | 'objc', content: string): string {
    const dirPath = this.pathResolver.resolveFrameworkDir(framework, language);
    const filePath = join(dirPath, '_index.md');
    this.writeFile(filePath, content);
    return filePath;
  }

  /**
   * Write a root index file for a language.
   */
  writeLanguageIndex(language: 'swift' | 'objc', content: string): string {
    const langDir = language === 'swift' ? 'Swift' : 'Objective-C';
    const filePath = join(this.outputDir, langDir, '_index.md');
    this.writeFile(filePath, content);
    return filePath;
  }

  /**
   * Write arbitrary file to output directory.
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
   */
  getPathResolver(): PathResolver {
    return this.pathResolver;
  }

  /**
   * Get write statistics.
   */
  getStats(): WriteStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      filesWritten: 0,
      directoriesCreated: 0,
      bytesWritten: 0,
    };
  }

  /**
   * Ensure output directories exist.
   */
  ensureOutputDirs(): void {
    const swiftDir = join(this.outputDir, 'Swift');
    const objcDir = join(this.outputDir, 'Objective-C');

    for (const dir of [swiftDir, objcDir]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        this.stats.directoriesCreated++;
      }
      this.createdDirs.add(dir);
    }
  }
}
