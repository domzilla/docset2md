/**
 * @file DocCConverter.test.ts
 * @module tests/unit/converter/DocCConverter
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Unit tests for DocCConverter.
 */

import { DocCConverter } from '../../../src/docc/DocCConverter.js';
import type { DocsetFormat, NormalizedEntry, ParsedContent } from '../../../src/shared/formats/types.js';

describe('DocCConverter', () => {
  let converter: DocCConverter;
  let mockFormat: DocsetFormat;

  beforeEach(() => {
    mockFormat = {
      detect: async () => true,
      getName: () => 'Apple DocC',
      isInitialized: () => true,
      initialize: async () => {},
      getEntryCount: () => 0,
      iterateEntries: function* () {},
      extractContent: async () => null,
      getTypes: () => [],
      getCategories: () => [],
      supportsMultipleLanguages: () => true,
      getLanguages: () => ['swift', 'objc'],
      close: () => {},
    } as DocsetFormat;

    converter = new DocCConverter(mockFormat);
  });

  afterEach(() => {
    converter.close();
  });

  describe('getOutputPath', () => {
    it('should generate swift/framework/item.md paths for Swift entries', () => {
      const entry: NormalizedEntry = {
        id: 1,
        name: 'UIWindow',
        type: 'Class',
        path: 'ls/documentation/uikit/uiwindow',
        language: 'swift',
      };
      const content: ParsedContent = {
        title: 'UIWindow',
        type: 'Class',
        framework: 'UIKit',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      expect(path).toBe('/output/swift/uikit/uiwindow.md');
    });

    it('should generate objective-c/framework/item.md paths for ObjC entries', () => {
      const entry: NormalizedEntry = {
        id: 2,
        name: 'UIWindow',
        type: 'Class',
        path: 'lc/documentation/uikit/uiwindow',
        language: 'objc',
      };
      const content: ParsedContent = {
        title: 'UIWindow',
        type: 'Class',
        framework: 'UIKit',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      expect(path).toBe('/output/objective-c/uikit/uiwindow.md');
    });

    it('should handle nested paths correctly', () => {
      const entry: NormalizedEntry = {
        id: 3,
        name: 'rootViewController',
        type: 'Property',
        path: 'ls/documentation/uikit/uiwindow/rootviewcontroller',
        language: 'swift',
      };
      const content: ParsedContent = {
        title: 'rootViewController',
        type: 'Property',
        framework: 'UIKit',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      expect(path).toBe('/output/swift/uikit/uiwindow/rootviewcontroller.md');
    });

    it('should create _index.md for framework root', () => {
      const entry: NormalizedEntry = {
        id: 4,
        name: 'UIKit',
        type: 'Framework',
        path: 'ls/documentation/uikit',
        language: 'swift',
      };
      const content: ParsedContent = {
        title: 'UIKit',
        type: 'Framework',
        framework: 'UIKit',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      expect(path).toBe('/output/swift/uikit/_index.md');
    });

    it('should sanitize method signatures in filenames', () => {
      const entry: NormalizedEntry = {
        id: 5,
        name: 'init(frame:)',
        type: 'Method',
        path: 'ls/documentation/uikit/uiwindow/init(frame:)',
        language: 'swift',
      };
      const content: ParsedContent = {
        title: 'init(frame:)',
        type: 'Method',
        framework: 'UIKit',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      expect(path).toBe('/output/swift/uikit/uiwindow/init_frame.md');
    });

    it('should use lowercase framework from content when path does not match', () => {
      const entry: NormalizedEntry = {
        id: 6,
        name: 'SomeClass',
        type: 'Class',
        path: 'invalid/path',
        language: 'swift',
      };
      const content: ParsedContent = {
        title: 'SomeClass',
        type: 'Class',
        framework: 'MyFramework',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      expect(path).toBe('/output/swift/myframework/someclass.md');
    });

    it('should use "other" framework when content.framework is empty', () => {
      const entry: NormalizedEntry = {
        id: 7,
        name: 'SomeClass',
        type: 'Class',
        path: 'invalid/path',
        language: 'swift',
      };
      const content: ParsedContent = {
        title: 'SomeClass',
        type: 'Class',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      expect(path).toBe('/output/swift/other/someclass.md');
    });
  });

  describe('getFormat', () => {
    it('should return the format handler', () => {
      expect(converter.getFormat()).toBe(mockFormat);
    });
  });

  describe('getFormatName', () => {
    it('should return the format name', () => {
      expect(converter.getFormatName()).toBe('Apple DocC');
    });
  });
});
