/**
 * @file StandardDashConverter.test.ts
 * @module tests/unit/converter/StandardDashConverter
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Unit tests for StandardDashConverter.
 */

import { StandardDashConverter } from '../../../src/converter/StandardDashConverter.js';
import type { DocsetFormat, NormalizedEntry, ParsedContent } from '../../../src/formats/types.js';

describe('StandardDashConverter', () => {
  let converter: StandardDashConverter;
  let mockFormat: DocsetFormat;

  beforeEach(() => {
    mockFormat = {
      detect: async () => true,
      getName: () => 'Standard Dash',
      isInitialized: () => true,
      initialize: async () => {},
      getEntryCount: () => 0,
      iterateEntries: function* () {},
      extractContent: async () => null,
      getTypes: () => [],
      getCategories: () => [],
      supportsMultipleLanguages: () => false,
      getLanguages: () => [],
      close: () => {},
    } as DocsetFormat;

    converter = new StandardDashConverter(mockFormat, 'PHP');
  });

  afterEach(() => {
    converter.close();
  });

  describe('getOutputPath', () => {
    it('should generate type/item.md paths', () => {
      const entry: NormalizedEntry = {
        id: 1,
        name: 'array_map',
        type: 'Function',
        path: 'php/array_map',
      };
      const content: ParsedContent = {
        title: 'array_map',
        type: 'Function',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      expect(path).toBe('/output/function/array_map.md');
    });

    it('should lowercase type names', () => {
      const entry: NormalizedEntry = {
        id: 2,
        name: 'DateTime',
        type: 'Class',
        path: 'php/DateTime',
      };
      const content: ParsedContent = {
        title: 'DateTime',
        type: 'Class',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      expect(path).toBe('/output/class/datetime.md');
    });

    it('should sanitize filenames with special characters', () => {
      const entry: NormalizedEntry = {
        id: 3,
        name: 'array<int|string>',
        type: 'Type',
        path: 'php/array',
      };
      const content: ParsedContent = {
        title: 'array<int|string>',
        type: 'Type',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      // < and > and | are replaced with _
      expect(path).toBe('/output/type/array_int_string.md');
    });

    it('should handle method signatures', () => {
      const entry: NormalizedEntry = {
        id: 4,
        name: 'getIterator()',
        type: 'Method',
        path: 'php/getIterator',
      };
      const content: ParsedContent = {
        title: 'getIterator()',
        type: 'Method',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      // Parentheses are handled, resulting in just the method name
      expect(path).toBe('/output/method/getiterator.md');
    });

    it('should handle entries with namespace separators', () => {
      const entry: NormalizedEntry = {
        id: 5,
        name: 'Symfony\\Component\\HttpFoundation\\Request',
        type: 'Class',
        path: 'symfony/Request',
      };
      const content: ParsedContent = {
        title: 'Symfony\\Component\\HttpFoundation\\Request',
        type: 'Class',
      };

      const path = converter.getOutputPath(entry, content, '/output');
      expect(path).toBe('/output/class/symfony_component_httpfoundation_request.md');
    });
  });

  describe('getFormat', () => {
    it('should return the format handler', () => {
      expect(converter.getFormat()).toBe(mockFormat);
    });
  });

  describe('getFormatName', () => {
    it('should return the format name', () => {
      expect(converter.getFormatName()).toBe('Standard Dash');
    });
  });
});
