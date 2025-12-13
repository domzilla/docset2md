/**
 * @file DocCParser.test.ts
 * @module tests/unit/parser/DocCParser
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Unit tests for DocCParser JSON parsing.
 */

import { DocCParser } from '../../../src/parser/DocCParser.js';
import type { DocCDocument } from '../../../src/parser/types.js';

describe('DocCParser', () => {
  let parser: DocCParser;

  beforeEach(() => {
    parser = new DocCParser();
  });

  describe('parse', () => {
    it('should parse a minimal DocC document', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiwindow', interfaceLanguage: 'swift' },
        metadata: { title: 'UIWindow', role: 'symbol' },
        references: {},
      };

      const result = parser.parse(doc, 'swift');

      expect(result.title).toBe('UIWindow');
      expect(result.kind).toBe('symbol');
      expect(result.role).toBe('symbol');
      expect(result.language).toBe('swift');
    });

    it('should handle document without metadata', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiwindow', interfaceLanguage: 'swift' },
        references: {},
      };

      const result = parser.parse(doc, 'swift');

      expect(result.title).toBe('Untitled');
      expect(result.role).toBe('unknown');
    });

    it('should extract framework from modules', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiwindow', interfaceLanguage: 'swift' },
        metadata: {
          title: 'UIWindow',
          role: 'symbol',
          modules: [{ name: 'UIKit' }],
        },
        references: {},
      };

      const result = parser.parse(doc, 'swift');

      expect(result.framework).toBe('UIKit');
    });

    it('should extract framework from URL when modules not present', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/foundation/nsstring', interfaceLanguage: 'swift' },
        metadata: { title: 'NSString', role: 'symbol' },
        references: {},
      };

      const result = parser.parse(doc, 'swift');

      expect(result.framework).toBe('foundation');
    });

    it('should render abstract text', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiwindow', interfaceLanguage: 'swift' },
        metadata: { title: 'UIWindow', role: 'symbol' },
        abstract: [{ type: 'text', text: 'A window object.' }],
        references: {},
      };

      const result = parser.parse(doc, 'swift');

      expect(result.abstract).toBe('A window object.');
    });

    it('should render abstract with code voice', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiwindow', interfaceLanguage: 'swift' },
        metadata: { title: 'UIWindow', role: 'symbol' },
        abstract: [
          { type: 'text', text: 'Use ' },
          { type: 'codeVoice', code: 'UIWindow' },
          { type: 'text', text: ' to display views.' },
        ],
        references: {},
      };

      const result = parser.parse(doc, 'swift');

      expect(result.abstract).toBe('Use `UIWindow` to display views.');
    });

    it('should extract declaration from declarations section', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiwindow', interfaceLanguage: 'swift' },
        metadata: { title: 'UIWindow', role: 'symbol' },
        primaryContentSections: [
          {
            kind: 'declarations',
            declarations: [
              {
                platforms: ['iOS'],
                languages: ['swift'],
                tokens: [
                  { kind: 'keyword', text: 'class ' },
                  { kind: 'identifier', text: 'UIWindow' },
                  { kind: 'text', text: ' : ' },
                  { kind: 'typeIdentifier', text: 'UIView' },
                ],
              },
            ],
          },
        ],
        references: {},
      };

      const result = parser.parse(doc, 'swift');

      expect(result.declaration).toBe('class UIWindow : UIView');
    });

    it('should extract platforms', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiwindow', interfaceLanguage: 'swift' },
        metadata: {
          title: 'UIWindow',
          role: 'symbol',
          platforms: [
            { name: 'iOS', introducedAt: '2.0' },
            { name: 'macOS', introducedAt: '10.15', deprecated: true },
          ],
        },
        references: {},
      };

      const result = parser.parse(doc, 'swift');

      expect(result.platforms).toHaveLength(2);
      expect(result.platforms![0].name).toBe('iOS');
      expect(result.platforms![0].introducedAt).toBe('2.0');
      expect(result.deprecated).toBe(true); // Because macOS is deprecated
    });

    it('should extract topics with references', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiwindow', interfaceLanguage: 'swift' },
        metadata: { title: 'UIWindow', role: 'symbol' },
        topicSections: [
          {
            title: 'Getting the Root View Controller',
            identifiers: ['doc://com.apple.UIKit/documentation/UIKit/UIWindow/rootViewController'],
          },
        ],
        references: {
          'doc://com.apple.UIKit/documentation/UIKit/UIWindow/rootViewController': {
            type: 'topic',
            identifier: 'doc://com.apple.UIKit/documentation/UIKit/UIWindow/rootViewController',
            title: 'rootViewController',
            url: '/documentation/uikit/uiwindow/rootviewcontroller',
            abstract: [{ type: 'text', text: 'The root view controller.' }],
          },
        },
      };

      const result = parser.parse(doc, 'swift');

      expect(result.topics).toHaveLength(1);
      expect(result.topics![0].title).toBe('Getting the Root View Controller');
      expect(result.topics![0].items).toHaveLength(1);
      expect(result.topics![0].items[0].title).toBe('rootViewController');
      expect(result.topics![0].items[0].abstract).toBe('The root view controller.');
    });

    it('should handle parameters section', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiwindow/init(frame:)', interfaceLanguage: 'swift' },
        metadata: { title: 'init(frame:)', role: 'symbol' },
        primaryContentSections: [
          {
            kind: 'parameters',
            parameters: [
              {
                name: 'frame',
                content: [{ type: 'paragraph', inlineContent: [{ type: 'text', text: 'The frame rectangle.' }] }],
              },
            ],
          },
        ],
        references: {},
      };

      const result = parser.parse(doc, 'swift');

      expect(result.parameters).toHaveLength(1);
      expect(result.parameters![0].name).toBe('frame');
      expect(result.parameters![0].description).toBe('The frame rectangle.');
    });

    it('should extract hierarchy', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiwindow', interfaceLanguage: 'swift' },
        metadata: { title: 'UIWindow', role: 'symbol' },
        hierarchy: {
          paths: [['doc://UIKit', 'doc://UIKit/UIView', 'doc://UIKit/UIWindow']],
        },
        references: {
          'doc://UIKit': { type: 'topic', identifier: 'doc://UIKit', title: 'UIKit' },
          'doc://UIKit/UIView': { type: 'topic', identifier: 'doc://UIKit/UIView', title: 'UIView' },
          'doc://UIKit/UIWindow': { type: 'topic', identifier: 'doc://UIKit/UIWindow', title: 'UIWindow' },
        },
      };

      const result = parser.parse(doc, 'swift');

      expect(result.hierarchy).toEqual(['UIKit', 'UIView', 'UIWindow']);
    });

    it('should detect beta status', () => {
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/swiftui/view', interfaceLanguage: 'swift' },
        metadata: {
          title: 'View',
          role: 'symbol',
          platforms: [{ name: 'iOS', introducedAt: '17.0', beta: true }],
        },
        references: {},
      };

      const result = parser.parse(doc, 'swift');

      expect(result.beta).toBe(true);
    });
  });

  describe('URL mapping', () => {
    it('should register and use path mappings', () => {
      parser.registerPath('/documentation/uikit/uiwindow', './UIWindow.md');

      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiview', interfaceLanguage: 'swift' },
        metadata: { title: 'UIView', role: 'symbol' },
        topicSections: [
          {
            title: 'Subclasses',
            identifiers: ['doc://com.apple.UIKit/documentation/UIKit/UIWindow'],
          },
        ],
        references: {
          'doc://com.apple.UIKit/documentation/UIKit/UIWindow': {
            type: 'topic',
            identifier: 'doc://com.apple.UIKit/documentation/UIKit/UIWindow',
            title: 'UIWindow',
            url: '/documentation/uikit/uiwindow',
          },
        },
      };

      const result = parser.parse(doc, 'swift');

      expect(result.topics![0].items[0].url).toBe('./UIWindow.md');
    });

    it('should clear mappings', () => {
      parser.registerPath('/documentation/uikit/uiwindow', './UIWindow.md');
      parser.clearMappings();

      // After clearing, should fall back to building path from URL
      const doc: DocCDocument = {
        schemaVersion: { major: 0, minor: 3, patch: 0 },
        kind: 'symbol',
        identifier: { url: '/documentation/uikit/uiview', interfaceLanguage: 'swift' },
        metadata: { title: 'UIView', role: 'symbol' },
        topicSections: [
          {
            title: 'Subclasses',
            identifiers: ['doc://com.apple.UIKit/documentation/UIKit/UIWindow'],
          },
        ],
        references: {
          'doc://com.apple.UIKit/documentation/UIKit/UIWindow': {
            type: 'topic',
            identifier: 'doc://com.apple.UIKit/documentation/UIKit/UIWindow',
            title: 'UIWindow',
            url: '/documentation/uikit/uiwindow',
          },
        },
      };

      const result = parser.parse(doc, 'swift');

      // Should build relative path, not use the registered one (lowercased for filesystem consistency)
      expect(result.topics![0].items[0].url).toContain('uiwindow.md');
    });
  });
});
