/**
 * @file PathResolver.test.ts
 * @module tests/unit/writer/PathResolver
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Unit tests for PathResolver path resolution and sanitization.
 */

import { PathResolver } from '../../../src/writer/PathResolver.js';

describe('PathResolver', () => {
  let resolver: PathResolver;

  beforeEach(() => {
    resolver = new PathResolver('/output');
  });

  describe('resolveFilePath', () => {
    it('should create Swift directory for swift language', () => {
      const path = resolver.resolveFilePath('ls/documentation/uikit/uiwindow', 'swift', 'UIWindow');

      expect(path).toContain('/Swift/');
    });

    it('should create Objective-C directory for objc language', () => {
      const path = resolver.resolveFilePath('lc/documentation/uikit/uiwindow', 'objc', 'UIWindow');

      expect(path).toContain('/Objective-C/');
    });

    it('should capitalize framework names correctly', () => {
      const tests = [
        { input: 'uikit', expected: 'UIKit' },
        { input: 'appkit', expected: 'AppKit' },
        { input: 'swiftui', expected: 'SwiftUI' },
        { input: 'foundation', expected: 'Foundation' },
        { input: 'coregraphics', expected: 'CoreGraphics' },
        { input: 'avfoundation', expected: 'AVFoundation' },
      ];

      for (const { input, expected } of tests) {
        const path = resolver.resolveFilePath(`ls/documentation/${input}/someclass`, 'swift', 'SomeClass');
        expect(path).toContain(`/${expected}/`);
      }
    });

    it('should handle unknown frameworks with default capitalization', () => {
      const path = resolver.resolveFilePath('ls/documentation/customframework/item', 'swift', 'Item');

      expect(path).toContain('/Customframework/');
    });

    it('should create index file for framework root', () => {
      const path = resolver.resolveFilePath('ls/documentation/uikit', 'swift', 'UIKit');

      expect(path).toMatch(/\/Swift\/UIKit\/_index\.md$/);
    });

    it('should handle nested paths', () => {
      const path = resolver.resolveFilePath(
        'ls/documentation/uikit/uiwindow/rootviewcontroller',
        'swift',
        'rootViewController'
      );

      expect(path).toContain('/UIKit/uiwindow/');
      expect(path).toMatch(/rootViewController\.md$/);
    });

    it('should sanitize filename', () => {
      const path = resolver.resolveFilePath(
        'ls/documentation/uikit/init',
        'swift',
        'init(frame:)'
      );

      expect(path).toMatch(/init\.md$/);
      expect(path).not.toContain('(');
    });

    it('should handle invalid request keys', () => {
      const path = resolver.resolveFilePath('invalid', 'swift', 'Test');

      expect(path).toMatch(/Test\.md$/);
      expect(path).toContain('/Swift/');
    });
  });

  describe('resolveFrameworkDir', () => {
    it('should resolve framework directory for Swift', () => {
      const dir = resolver.resolveFrameworkDir('uikit', 'swift');

      expect(dir).toBe('/output/Swift/UIKit');
    });

    it('should resolve framework directory for Objective-C', () => {
      const dir = resolver.resolveFrameworkDir('uikit', 'objc');

      expect(dir).toBe('/output/Objective-C/UIKit');
    });
  });

  describe('getRelativePath', () => {
    it('should return relative path for same directory', () => {
      const relative = resolver.getRelativePath(
        '/output/Swift/UIKit/UIWindow.md',
        '/output/Swift/UIKit/UIView.md'
      );

      expect(relative).toBe('./UIView.md');
    });

    it('should return relative path for sibling directories', () => {
      const relative = resolver.getRelativePath(
        '/output/Swift/UIKit/UIWindow.md',
        '/output/Swift/Foundation/NSObject.md'
      );

      expect(relative).toBe('../Foundation/NSObject.md');
    });

    it('should handle deeper nesting', () => {
      const relative = resolver.getRelativePath(
        '/output/Swift/UIKit/UIWindow/rootViewController.md',
        '/output/Swift/UIKit/UIView.md'
      );

      expect(relative).toBe('../UIView.md');
    });
  });

  describe('sanitizeFileName', () => {
    it('should remove invalid characters', () => {
      expect(resolver.sanitizeFileName('Test<>:"/\\|?*File')).toBe('Test_File');
    });

    it('should replace spaces with underscores', () => {
      expect(resolver.sanitizeFileName('Test File Name')).toBe('Test_File_Name');
    });

    it('should truncate method signatures at parenthesis', () => {
      expect(resolver.sanitizeFileName('init(frame:)')).toBe('init');
      expect(resolver.sanitizeFileName('perform(_:with:afterDelay:)')).toBe('perform');
    });

    it('should collapse multiple underscores', () => {
      expect(resolver.sanitizeFileName('Test___Name')).toBe('Test_Name');
    });

    it('should remove leading and trailing underscores', () => {
      expect(resolver.sanitizeFileName('_Test_')).toBe('Test');
    });

    it('should truncate very long names', () => {
      const longName = 'a'.repeat(150);
      const result = resolver.sanitizeFileName(longName);

      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('should return unnamed for empty string', () => {
      expect(resolver.sanitizeFileName('')).toBe('unnamed');
    });

    it('should return unnamed for string with only invalid chars', () => {
      expect(resolver.sanitizeFileName('<>:"/\\|?*')).toBe('unnamed');
    });

    it('should handle complex method signatures', () => {
      expect(resolver.sanitizeFileName('subscript(_:)')).toBe('subscript');
      expect(resolver.sanitizeFileName('encode(to:)')).toBe('encode');
    });

    it('should preserve valid characters', () => {
      expect(resolver.sanitizeFileName('validFileName123')).toBe('validFileName123');
    });
  });
});
