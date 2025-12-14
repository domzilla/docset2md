/**
 * @file converter-pipeline.test.ts
 * @module tests/integration/converter-pipeline
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Integration tests for the full conversion pipeline.
 */

import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FormatDetector } from '../../src/factory/FormatDetector.js';
import { ConverterFactory } from '../../src/factory/ConverterFactory.js';

// Test data paths
const TEST_DATA_DIR = join(process.cwd(), 'test_data', 'input');
const APPLE_DOCSET_PATH = join(TEST_DATA_DIR, 'Apple_UIKit_Reference.docset');
const PHP_DOCSET_PATH = join(TEST_DATA_DIR, 'PHP.docset');

// Helper to check if test data exists
const hasAppleTestData = () => existsSync(APPLE_DOCSET_PATH);
const hasPhpTestData = () => existsSync(PHP_DOCSET_PATH);

describe('Converter Pipeline Integration', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = join(tmpdir(), `docset2md-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Apple DocC conversion', () => {
    const hasTestData = hasAppleTestData();

    beforeAll(() => {
      if (!hasTestData) {
        console.warn('Apple test data not found. Skipping Apple converter tests.');
      }
    });

    (hasTestData ? it : it.skip)('should convert Apple docset with proper directory structure', async () => {
      const outputDir = join(tempDir, 'apple-output');
      mkdirSync(outputDir, { recursive: true });

      const registry = new FormatDetector();
      const format = await registry.detectFormat(APPLE_DOCSET_PATH);

      expect(format).not.toBeNull();
      expect(format!.getName()).toBe('Apple DocC');

      const converter = ConverterFactory.createConverter(format!, 'Apple');

      const result = await converter.convert({
        outputDir,
        filters: { limit: 10 },
      });

      expect(result.processed).toBe(10);
      expect(result.successful).toBeGreaterThan(0);
      expect(result.writeStats.filesWritten).toBeGreaterThan(0);

      // Check directory structure
      expect(existsSync(join(outputDir, 'swift'))).toBe(true);

      converter.close();
    });

    (hasTestData ? it : it.skip)('should generate index files for Apple docset', async () => {
      const outputDir = join(tempDir, 'apple-index-output');
      mkdirSync(outputDir, { recursive: true });

      const registry = new FormatDetector();
      const format = await registry.detectFormat(APPLE_DOCSET_PATH);

      const converter = ConverterFactory.createConverter(format!, 'Apple');

      await converter.convert({
        outputDir,
        filters: { limit: 50 },
      });

      // Check for language root index
      const swiftDir = join(outputDir, 'swift');
      if (existsSync(swiftDir)) {
        const swiftContents = readdirSync(swiftDir);
        // Should have framework directories
        expect(swiftContents.length).toBeGreaterThan(0);
      }

      converter.close();
    });
  });

  describe('Standard Dash conversion', () => {
    const hasTestData = hasPhpTestData();

    beforeAll(() => {
      if (!hasTestData) {
        console.warn('PHP test data not found. Skipping Standard Dash converter tests.');
      }
    });

    (hasTestData ? it : it.skip)('should convert Standard Dash docset with proper directory structure', async () => {
      const outputDir = join(tempDir, 'php-output');
      mkdirSync(outputDir, { recursive: true });

      const registry = new FormatDetector();
      const format = await registry.detectFormat(PHP_DOCSET_PATH);

      expect(format).not.toBeNull();
      expect(format!.getName()).toBe('Standard Dash');

      const converter = ConverterFactory.createConverter(format!, 'PHP');

      const result = await converter.convert({
        outputDir,
        filters: { limit: 10 },
      });

      expect(result.processed).toBe(10);
      expect(result.successful).toBeGreaterThan(0);
      expect(result.writeStats.filesWritten).toBeGreaterThan(0);

      converter.close();
    });

    (hasTestData ? it : it.skip)('should generate index files for Standard Dash docset', async () => {
      const outputDir = join(tempDir, 'php-index-output');
      mkdirSync(outputDir, { recursive: true });

      const registry = new FormatDetector();
      const format = await registry.detectFormat(PHP_DOCSET_PATH);

      const converter = ConverterFactory.createConverter(format!, 'PHP');

      await converter.convert({
        outputDir,
        filters: { limit: 50 },
      });

      // Check for root index
      expect(existsSync(join(outputDir, '_index.md'))).toBe(true);

      // Check for type directories
      const contents = readdirSync(outputDir);
      expect(contents.length).toBeGreaterThan(1); // At least _index.md + type dirs

      converter.close();
    });
  });

  describe('Progress callback', () => {
    const hasTestData = hasPhpTestData();

    (hasTestData ? it : it.skip)('should call progress callback during conversion', async () => {
      const outputDir = join(tempDir, 'progress-output');
      mkdirSync(outputDir, { recursive: true });

      const registry = new FormatDetector();
      const format = await registry.detectFormat(PHP_DOCSET_PATH);

      const converter = ConverterFactory.createConverter(format!, 'PHP');

      const progressCalls: number[] = [];
      const onProgress = (current: number) => {
        progressCalls.push(current);
      };

      await converter.convert(
        {
          outputDir,
          filters: { limit: 5 },
        },
        onProgress
      );

      expect(progressCalls).toEqual([1, 2, 3, 4, 5]);

      converter.close();
    });
  });

  describe('Conversion statistics', () => {
    const hasTestData = hasPhpTestData();

    (hasTestData ? it : it.skip)('should return accurate statistics', async () => {
      const outputDir = join(tempDir, 'stats-output');
      mkdirSync(outputDir, { recursive: true });

      const registry = new FormatDetector();
      const format = await registry.detectFormat(PHP_DOCSET_PATH);

      const converter = ConverterFactory.createConverter(format!, 'PHP');

      const result = await converter.convert({
        outputDir,
        filters: { limit: 10 },
      });

      // Verify statistics
      expect(result.processed).toBe(10);
      expect(result.successful + result.failed).toBe(result.processed);
      expect(result.elapsedMs).toBeGreaterThan(0);
      // filesWritten can be >= successful because index files are also written
      expect(result.writeStats.filesWritten).toBeGreaterThanOrEqual(result.successful);
      expect(result.writeStats.bytesWritten).toBeGreaterThan(0);

      converter.close();
    });
  });
});
