/**
 * @file UuidGenerator.test.ts
 * @module tests/unit/extractor/UuidGenerator
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Unit tests for UUID generation and request key parsing.
 */

import { generateUuid, getDocPath, extractFramework, getLanguage } from '../../../src/docc/uuid-generator.js';

describe('UuidGenerator', () => {
    describe('generateUuid', () => {
        it('should generate correct UUID for Swift request key', () => {
            const uuid = generateUuid('ls/documentation/uikit/uiwindow');
            expect(uuid).toMatch(/^ls[A-Za-z0-9_-]{8}$/);
            expect(uuid.startsWith('ls')).toBe(true);
        });

        it('should generate correct UUID for Objective-C request key', () => {
            const uuid = generateUuid('lc/documentation/uikit/uiwindow');
            expect(uuid).toMatch(/^lc[A-Za-z0-9_-]{8}$/);
            expect(uuid.startsWith('lc')).toBe(true);
        });

        it('should generate deterministic output (same input = same output)', () => {
            const uuid1 = generateUuid('ls/documentation/uikit/uiwindow');
            const uuid2 = generateUuid('ls/documentation/uikit/uiwindow');
            expect(uuid1).toBe(uuid2);
        });

        it('should generate different UUIDs for different paths', () => {
            const uuid1 = generateUuid('ls/documentation/uikit');
            const uuid2 = generateUuid('ls/documentation/foundation');
            expect(uuid1).not.toBe(uuid2);
        });

        it('should generate different UUIDs for same path in different languages', () => {
            const swiftUuid = generateUuid('ls/documentation/uikit/uiwindow');
            const objcUuid = generateUuid('lc/documentation/uikit/uiwindow');
            expect(swiftUuid).not.toBe(objcUuid);
        });

        it('should throw for invalid request key format (no language prefix)', () => {
            expect(() => generateUuid('documentation/uikit')).toThrow('Invalid request key format');
        });

        it('should throw for invalid request key format (wrong prefix)', () => {
            expect(() => generateUuid('xx/documentation/uikit')).toThrow('Invalid request key format');
        });

        it('should handle deep nested paths', () => {
            const uuid = generateUuid('ls/documentation/uikit/uiwindow/rootviewcontroller/set');
            expect(uuid).toMatch(/^ls[A-Za-z0-9_-]{8}$/);
        });

        it('should handle paths with special characters (URL encoded)', () => {
            const uuid = generateUuid('ls/documentation/swift/array/subscript(_:)');
            expect(uuid).toMatch(/^ls[A-Za-z0-9_-]{8}$/);
        });
    });

    describe('getDocPath', () => {
        it('should extract canonical path from Swift key', () => {
            expect(getDocPath('ls/documentation/uikit')).toBe('/documentation/uikit');
        });

        it('should extract canonical path from Obj-C key', () => {
            expect(getDocPath('lc/documentation/uikit')).toBe('/documentation/uikit');
        });

        it('should handle deep paths', () => {
            expect(getDocPath('ls/documentation/uikit/uiwindow/rootviewcontroller'))
                .toBe('/documentation/uikit/uiwindow/rootviewcontroller');
        });

        it('should handle paths without language prefix', () => {
            expect(getDocPath('documentation/uikit')).toBe('/documentation/uikit');
        });
    });

    describe('extractFramework', () => {
        it('should extract framework name from Swift request key', () => {
            expect(extractFramework('ls/documentation/uikit/uiwindow')).toBe('uikit');
        });

        it('should extract framework name from Objective-C request key', () => {
            expect(extractFramework('lc/documentation/foundation/nsstring')).toBe('foundation');
        });

        it('should extract framework name from root path', () => {
            expect(extractFramework('ls/documentation/accelerate')).toBe('accelerate');
        });

        it('should return undefined for invalid path', () => {
            expect(extractFramework('invalid')).toBeUndefined();
        });

        it('should return undefined for path without documentation segment', () => {
            expect(extractFramework('ls/other/path')).toBeUndefined();
        });
    });

    describe('getLanguage', () => {
        it('should return swift for ls/ prefix', () => {
            expect(getLanguage('ls/documentation/uikit')).toBe('swift');
        });

        it('should return objc for lc/ prefix', () => {
            expect(getLanguage('lc/documentation/uikit')).toBe('objc');
        });

        it('should return objc for any non-ls prefix', () => {
            expect(getLanguage('xx/documentation/uikit')).toBe('objc');
        });
    });
});
