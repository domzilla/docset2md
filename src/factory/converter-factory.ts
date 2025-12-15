/**
 * @file ConverterFactory.ts
 * @module factory/ConverterFactory
 * @author Dominic Rodemer
 * @created 2025-12-13
 * @license MIT
 *
 * @fileoverview Factory for creating format-specific converters.
 */

import type { DocsetFormat } from '../shared/formats/types.js';
import type { DocsetConverter } from '../shared/converter/types.js';
import { DocCConverter } from '../docc/docc-converter.js';
import { StandardConverter } from '../standard/standard-converter.js';
import { CoreDataConverter } from '../coredata/coredata-converter.js';

/**
 * Factory for creating converters based on format handlers.
 *
 * @example
 * ```typescript
 * const format = await detector.detectFormat('/path/to/docset');
 * const converter = ConverterFactory.createConverter(format, 'MyDocset');
 * const result = await converter.convert({ outputDir: './output' });
 * ```
 */
export class ConverterFactory {
    /**
     * Create a converter for the given format handler.
     *
     * @param format - Initialized format handler
     * @param docsetName - Name of the docset (for index titles)
     * @returns Appropriate converter for the format
     */
    static createConverter(format: DocsetFormat, docsetName: string): DocsetConverter {
        const formatName = format.getName();

        switch (formatName) {
            case 'Apple DocC':
                return new DocCConverter(format);
            case 'Standard Dash':
                return new StandardConverter(format, docsetName);
            case 'CoreData':
                return new CoreDataConverter(format, docsetName);
            default:
                // Fallback to Standard for unknown formats
                return new StandardConverter(format, docsetName);
        }
    }
}
