/**
 * @file ConverterFactory.test.ts
 * @module tests/unit/converter/ConverterFactory
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Unit tests for ConverterFactory.
 */

import { ConverterFactory } from '../../../src/factory/converter-factory.js';
import { DocCConverter } from '../../../src/docc/docc-converter.js';
import { StandardConverter } from '../../../src/standard/standard-converter.js';
import { CoreDataConverter } from '../../../src/coredata/coredata-converter.js';
import type { DocsetFormat } from '../../../src/shared/formats/types.js';

describe('ConverterFactory', () => {
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
        it('should create DocCConverter for Apple DocC format', () => {
            const format = createMockFormat('Apple DocC');
            const converter = ConverterFactory.createConverter(format, 'TestDocset');

            expect(converter).toBeInstanceOf(DocCConverter);
            expect(converter.getFormatName()).toBe('Apple DocC');
        });

        it('should create StandardConverter for Standard Dash format', () => {
            const format = createMockFormat('Standard Dash');
            const converter = ConverterFactory.createConverter(format, 'TestDocset');

            expect(converter).toBeInstanceOf(StandardConverter);
            expect(converter.getFormatName()).toBe('Standard Dash');
        });

        it('should create CoreDataConverter for CoreData format', () => {
            const format = createMockFormat('CoreData');
            const converter = ConverterFactory.createConverter(format, 'TestDocset');

            expect(converter).toBeInstanceOf(CoreDataConverter);
            expect(converter.getFormatName()).toBe('CoreData');
        });

        it('should fallback to StandardConverter for unknown format', () => {
            const format = createMockFormat('Unknown Format');
            const converter = ConverterFactory.createConverter(format, 'TestDocset');

            expect(converter).toBeInstanceOf(StandardConverter);
        });
    });
});
