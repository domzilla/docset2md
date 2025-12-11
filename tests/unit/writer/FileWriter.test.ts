/**
 * @file FileWriter.test.ts
 * @module tests/unit/writer/FileWriter
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Unit tests for FileWriter file output operations.
 */

import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileWriter } from '../../../src/writer/FileWriter.js';

describe('FileWriter', () => {
  let writer: FileWriter;
  let testOutputDir: string;

  beforeEach(() => {
    testOutputDir = join(tmpdir(), `docset2md-test-${Date.now()}`);
    mkdirSync(testOutputDir, { recursive: true });
    writer = new FileWriter(testOutputDir);
  });

  afterEach(() => {
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe('writeEntry', () => {
    it('should write entry to correct path', () => {
      const filePath = writer.writeEntry(
        'ls/documentation/uikit/uiwindow',
        'swift',
        'UIWindow',
        '# UIWindow'
      );

      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, 'utf-8')).toBe('# UIWindow');
    });

    it('should create directories as needed', () => {
      writer.writeEntry(
        'ls/documentation/uikit/uiwindow/rootviewcontroller',
        'swift',
        'rootViewController',
        '# rootViewController'
      );

      expect(existsSync(join(testOutputDir, 'Swift', 'UIKit', 'uiwindow'))).toBe(true);
    });

    it('should write Swift entries to Swift directory', () => {
      const filePath = writer.writeEntry('ls/documentation/uikit/uiview', 'swift', 'UIView', '# UIView');

      expect(filePath).toContain('/Swift/');
    });

    it('should write Objective-C entries to Objective-C directory', () => {
      const filePath = writer.writeEntry('lc/documentation/uikit/uiview', 'objc', 'UIView', '# UIView');

      expect(filePath).toContain('/Objective-C/');
    });
  });

  describe('writeFrameworkIndex', () => {
    it('should write framework index file', () => {
      const filePath = writer.writeFrameworkIndex('uikit', 'swift', '# UIKit Index');

      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toMatch(/_index\.md$/);
      expect(readFileSync(filePath, 'utf-8')).toBe('# UIKit Index');
    });

    it('should create framework directory', () => {
      writer.writeFrameworkIndex('foundation', 'objc', '# Foundation');

      expect(existsSync(join(testOutputDir, 'Objective-C', 'Foundation'))).toBe(true);
    });
  });

  describe('writeLanguageIndex', () => {
    it('should write language index file', () => {
      const filePath = writer.writeLanguageIndex('swift', '# Swift Documentation');

      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toMatch(/Swift\/_index\.md$/);
      expect(readFileSync(filePath, 'utf-8')).toBe('# Swift Documentation');
    });

    it('should write to Objective-C directory', () => {
      const filePath = writer.writeLanguageIndex('objc', '# Objective-C');

      expect(filePath).toContain('/Objective-C/');
    });
  });

  describe('writeFile', () => {
    it('should write arbitrary file', () => {
      const filePath = join(testOutputDir, 'test.md');
      writer.writeFile(filePath, '# Test');

      expect(existsSync(filePath)).toBe(true);
      expect(readFileSync(filePath, 'utf-8')).toBe('# Test');
    });

    it('should create parent directories', () => {
      const filePath = join(testOutputDir, 'deep/nested/dir/file.md');
      writer.writeFile(filePath, 'content');

      expect(existsSync(filePath)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should track files written', () => {
      writer.writeEntry('ls/documentation/uikit/uiwindow', 'swift', 'UIWindow', '# UIWindow');
      writer.writeEntry('ls/documentation/uikit/uiview', 'swift', 'UIView', '# UIView');

      const stats = writer.getStats();

      expect(stats.filesWritten).toBe(2);
    });

    it('should track directories created', () => {
      writer.resetStats();
      writer.writeEntry('ls/documentation/uikit/uiwindow', 'swift', 'UIWindow', '# UIWindow');
      writer.writeEntry('ls/documentation/foundation/nsstring', 'swift', 'NSString', '# NSString');

      const stats = writer.getStats();

      expect(stats.directoriesCreated).toBeGreaterThan(0);
    });

    it('should track bytes written', () => {
      const content = '# UIWindow\n\nThis is some content.';
      writer.writeEntry('ls/documentation/uikit/uiwindow', 'swift', 'UIWindow', content);

      const stats = writer.getStats();

      expect(stats.bytesWritten).toBe(Buffer.byteLength(content, 'utf-8'));
    });

    it('should return copy of stats', () => {
      const stats1 = writer.getStats();
      const stats2 = writer.getStats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', () => {
      writer.writeEntry('ls/documentation/uikit/uiwindow', 'swift', 'UIWindow', '# UIWindow');

      writer.resetStats();
      const stats = writer.getStats();

      expect(stats.filesWritten).toBe(0);
      expect(stats.directoriesCreated).toBe(0);
      expect(stats.bytesWritten).toBe(0);
    });
  });

  describe('ensureOutputDirs', () => {
    it('should create Swift and Objective-C directories', () => {
      writer.ensureOutputDirs();

      expect(existsSync(join(testOutputDir, 'Swift'))).toBe(true);
      expect(existsSync(join(testOutputDir, 'Objective-C'))).toBe(true);
    });

    it('should not fail if directories already exist', () => {
      mkdirSync(join(testOutputDir, 'Swift'), { recursive: true });

      expect(() => writer.ensureOutputDirs()).not.toThrow();
    });
  });

  describe('getPathResolver', () => {
    it('should return path resolver instance', () => {
      const resolver = writer.getPathResolver();

      expect(resolver).toBeDefined();
      expect(typeof resolver.sanitizeFileName).toBe('function');
    });
  });
});
