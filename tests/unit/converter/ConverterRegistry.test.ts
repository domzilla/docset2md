/**
 * @file ConverterRegistry.test.ts
 * @module tests/unit/converter/ConverterRegistry
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Unit tests for ConverterRegistry.
 */

import { ConverterRegistry } from '../../../src/converter/ConverterRegistry.js';
import { AppleConverter } from '../../../src/converter/AppleConverter.js';
import { StandardDashConverter } from '../../../src/converter/StandardDashConverter.js';
import { CoreDataConverter } from '../../../src/converter/CoreDataConverter.js';
import type { DocsetFormat } from '../../../src/formats/types.js';

describe('ConverterRegistry', () => {
  // Mock format handler factory
  function createMockFormat(name: string): DocsetFormat {
    return {
      detect: async () => true,
      getName: () => name,
      isInitialized: () => true,
      initialize: async () => {},
      getEntryCount: () => 0,
      iterateEntries: function* () {},
      extractContent: async () => null,
      getTypes: () => [],
      getCategories: () => [],
      supportsMultipleLanguages: () => name === 'Apple DocC',
      getLanguages: () => name === 'Apple DocC' ? ['swift', 'objc'] : [],
      close: () => {},
    } as DocsetFormat;
  }

  describe('createConverter', () => {
    it('should create AppleConverter for Apple DocC format', () => {
      const format = createMockFormat('Apple DocC');
      const converter = ConverterRegistry.createConverter(format, 'TestDocset');

      expect(converter).toBeInstanceOf(AppleConverter);
      expect(converter.getFormatName()).toBe('Apple DocC');
    });

    it('should create StandardDashConverter for Standard Dash format', () => {
      const format = createMockFormat('Standard Dash');
      const converter = ConverterRegistry.createConverter(format, 'TestDocset');

      expect(converter).toBeInstanceOf(StandardDashConverter);
      expect(converter.getFormatName()).toBe('Standard Dash');
    });

    it('should create CoreDataConverter for CoreData format', () => {
      const format = createMockFormat('CoreData');
      const converter = ConverterRegistry.createConverter(format, 'TestDocset');

      expect(converter).toBeInstanceOf(CoreDataConverter);
      expect(converter.getFormatName()).toBe('CoreData');
    });

    it('should fallback to StandardDashConverter for unknown format', () => {
      const format = createMockFormat('Unknown Format');
      const converter = ConverterRegistry.createConverter(format, 'TestDocset');

      expect(converter).toBeInstanceOf(StandardDashConverter);
    });
  });
});
