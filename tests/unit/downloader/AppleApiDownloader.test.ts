/**
 * @file AppleApiDownloader.test.ts
 * @module tests/unit/downloader/AppleApiDownloader
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Unit tests for AppleApiDownloader.
 */

import { AppleApiDownloader } from '../../../src/downloader/AppleApiDownloader.js';

describe('AppleApiDownloader', () => {
  let downloader: AppleApiDownloader;

  beforeEach(() => {
    downloader = new AppleApiDownloader();
  });

  afterEach(() => {
    downloader.clearCache();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const dl = new AppleApiDownloader();
      expect(dl).toBeInstanceOf(AppleApiDownloader);
    });

    it('should accept custom timeout and maxBuffer options', () => {
      const dl = new AppleApiDownloader({
        timeout: 60000,
        maxBuffer: 20 * 1024 * 1024,
      });
      expect(dl).toBeInstanceOf(AppleApiDownloader);
    });
  });

  describe('download', () => {
    it('should return null for invalid request key format', () => {
      const result = downloader.download('invalid/key/format');
      expect(result).toBeNull();
    });

    it('should return null for request key without language prefix', () => {
      const result = downloader.download('documentation/uikit/uiwindow');
      expect(result).toBeNull();
    });

    it('should handle ls/ prefix correctly', () => {
      // This will try to download, which may fail, but should not throw
      const result = downloader.download('ls/documentation/nonexistent/item');
      expect(result).toBeNull(); // Non-existent item returns null
    });

    it('should handle lc/ prefix correctly', () => {
      const result = downloader.download('lc/documentation/nonexistent/item');
      expect(result).toBeNull();
    });

    it('should cache failed downloads', () => {
      // First attempt
      downloader.download('ls/documentation/nonexistent/item');

      // Second attempt should hit cache
      const stats1 = downloader.getStats();
      downloader.download('ls/documentation/nonexistent/item');
      const stats2 = downloader.getStats();

      expect(stats2.cached).toBe(stats1.cached + 1);
    });
  });

  describe('isCached', () => {
    it('should return false for uncached request keys', () => {
      expect(downloader.isCached('ls/documentation/uikit/uiwindow')).toBe(false);
    });

    it('should return true after download attempt (even if failed)', () => {
      downloader.download('ls/documentation/nonexistent/item');
      expect(downloader.isCached('ls/documentation/nonexistent/item')).toBe(true);
    });
  });

  describe('hasDocument', () => {
    it('should return false for uncached request keys', () => {
      expect(downloader.hasDocument('ls/documentation/uikit/uiwindow')).toBe(false);
    });

    it('should return false for failed downloads', () => {
      downloader.download('ls/documentation/nonexistent/item');
      expect(downloader.hasDocument('ls/documentation/nonexistent/item')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return initial stats with all zeros', () => {
      const stats = downloader.getStats();
      expect(stats).toEqual({
        attempted: 0,
        successful: 0,
        failed: 0,
        cached: 0,
      });
    });

    it('should track attempted downloads', () => {
      downloader.download('ls/documentation/nonexistent/item');
      const stats = downloader.getStats();
      expect(stats.attempted).toBe(1);
    });

    it('should track failed downloads', () => {
      downloader.download('ls/documentation/nonexistent/item');
      const stats = downloader.getStats();
      expect(stats.failed).toBe(1);
    });

    it('should track failed downloads for invalid keys', () => {
      downloader.download('invalid');
      const stats = downloader.getStats();
      expect(stats.failed).toBe(1);
    });

    it('should return a copy of stats', () => {
      const stats1 = downloader.getStats();
      const stats2 = downloader.getStats();
      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('getDownloadCount', () => {
    it('should return 0 initially', () => {
      expect(downloader.getDownloadCount()).toBe(0);
    });

    it('should return 0 for failed downloads', () => {
      downloader.download('ls/documentation/nonexistent/item');
      expect(downloader.getDownloadCount()).toBe(0);
    });
  });

  describe('clearCache', () => {
    it('should clear the download cache', () => {
      downloader.download('ls/documentation/nonexistent/item');
      expect(downloader.isCached('ls/documentation/nonexistent/item')).toBe(true);

      downloader.clearCache();
      expect(downloader.isCached('ls/documentation/nonexistent/item')).toBe(false);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics to zero', () => {
      downloader.download('ls/documentation/nonexistent/item');
      expect(downloader.getStats().attempted).toBeGreaterThan(0);

      downloader.resetStats();
      const stats = downloader.getStats();
      expect(stats).toEqual({
        attempted: 0,
        successful: 0,
        failed: 0,
        cached: 0,
      });
    });
  });
});
