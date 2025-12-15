/**
 * @file PathResolver.test.ts
 * @module tests/unit/writer/PathResolver
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Unit tests for PathResolver path resolution and sanitization.
 */

import { PathResolver } from '../../../src/shared/path-resolver.js';

describe('PathResolver', () => {
    let resolver: PathResolver;

    beforeEach(() => {
        resolver = new PathResolver('/output');
    });

    describe('resolveFilePath', () => {
        it('should create swift directory for swift language', () => {
            const path = resolver.resolveFilePath(
                'ls/documentation/uikit/uiwindow',
                'swift',
                'UIWindow'
            );

            expect(path).toContain('/swift/');
        });

        it('should create objective-c directory for objc language', () => {
            const path = resolver.resolveFilePath(
                'lc/documentation/uikit/uiwindow',
                'objc',
                'UIWindow'
            );

            expect(path).toContain('/objective-c/');
        });

        it('should use lowercase framework names', () => {
            const tests = [
                'uikit',
                'appkit',
                'swiftui',
                'foundation',
                'coregraphics',
                'avfoundation',
            ];

            for (const input of tests) {
                const path = resolver.resolveFilePath(
                    `ls/documentation/${input}/someclass`,
                    'swift',
                    'SomeClass'
                );
                expect(path).toContain(`/${input}/`);
            }
        });

        it('should handle custom frameworks with lowercase', () => {
            const path = resolver.resolveFilePath(
                'ls/documentation/customframework/item',
                'swift',
                'Item'
            );

            expect(path).toContain('/customframework/');
        });

        it('should create index file for framework root', () => {
            const path = resolver.resolveFilePath('ls/documentation/uikit', 'swift', 'UIKit');

            expect(path).toMatch(/\/swift\/uikit\/_index\.md$/);
        });

        it('should handle nested paths', () => {
            const path = resolver.resolveFilePath(
                'ls/documentation/uikit/uiwindow/rootviewcontroller',
                'swift',
                'rootViewController'
            );

            expect(path).toContain('/uikit/uiwindow/');
            expect(path).toMatch(/rootviewcontroller\.md$/); // lowercase for filesystem consistency
        });

        it('should sanitize filename with method signatures', () => {
            const path = resolver.resolveFilePath(
                'ls/documentation/uikit/init',
                'swift',
                'init(frame:)'
            );

            expect(path).toMatch(/init_frame\.md$/);
            expect(path).not.toContain('(');
        });

        it('should handle invalid request keys', () => {
            const path = resolver.resolveFilePath('invalid', 'swift', 'Test');

            expect(path).toMatch(/test\.md$/); // lowercase for filesystem consistency
            expect(path).toContain('/swift/');
        });
    });

    describe('resolveFrameworkDir', () => {
        it('should resolve framework directory for swift', () => {
            const dir = resolver.resolveFrameworkDir('uikit', 'swift');

            expect(dir).toBe('/output/swift/uikit');
        });

        it('should resolve framework directory for objective-c', () => {
            const dir = resolver.resolveFrameworkDir('uikit', 'objc');

            expect(dir).toBe('/output/objective-c/uikit');
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
        it('should remove invalid characters and lowercase', () => {
            expect(resolver.sanitizeFileName('Test<>:"/\\|?*File')).toBe('test_file');
        });

        it('should replace spaces with underscores and lowercase', () => {
            expect(resolver.sanitizeFileName('Test File Name')).toBe('test_file_name');
        });

        it('should convert method signatures to unique filenames', () => {
            expect(resolver.sanitizeFileName('init(frame:)')).toBe('init_frame');
            expect(resolver.sanitizeFileName('init(coder:)')).toBe('init_coder');
            expect(resolver.sanitizeFileName('perform(_:with:afterDelay:)')).toBe(
                'perform_with_afterdelay'
            );
        });

        it('should collapse multiple underscores and lowercase', () => {
            expect(resolver.sanitizeFileName('Test___Name')).toBe('test_name');
        });

        it('should remove leading and trailing underscores and lowercase', () => {
            expect(resolver.sanitizeFileName('_Test_')).toBe('test');
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
            expect(resolver.sanitizeFileName('encode(to:)')).toBe('encode_to');
            expect(resolver.sanitizeFileName('application(_:didFinishLaunchingWithOptions:)')).toBe(
                'application_didfinishlaunchingwithoptions'
            );
        });

        it('should lowercase valid characters for filesystem consistency', () => {
            expect(resolver.sanitizeFileName('validFileName123')).toBe('validfilename123');
        });
    });
});
