import { MarkdownGenerator } from '../../../src/generator/MarkdownGenerator.js';
import type { ParsedDocumentation } from '../../../src/parser/types.js';

describe('MarkdownGenerator', () => {
  let generator: MarkdownGenerator;

  beforeEach(() => {
    generator = new MarkdownGenerator();
  });

  describe('generate', () => {
    it('should generate markdown with title', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
      };

      const md = generator.generate(doc);

      expect(md).toContain('# UIWindow');
    });

    it('should include framework metadata', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        framework: 'UIKit',
      };

      const md = generator.generate(doc);

      expect(md).toContain('**Framework**: UIKit');
    });

    it('should include type metadata', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'collection',
        language: 'swift',
      };

      const md = generator.generate(doc);

      expect(md).toContain('**Type**: Framework');
    });

    it('should include platforms', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        platforms: [
          { name: 'iOS', introducedAt: '2.0' },
          { name: 'macOS', introducedAt: '10.15' },
        ],
      };

      const md = generator.generate(doc);

      expect(md).toContain('**Platforms**:');
      expect(md).toContain('iOS 2.0+');
      expect(md).toContain('macOS 10.15+');
    });

    it('should show deprecated status', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        deprecated: true,
      };

      const md = generator.generate(doc);

      expect(md).toContain('**Status**: Deprecated');
    });

    it('should show beta status', () => {
      const doc: ParsedDocumentation = {
        title: 'View',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        beta: true,
      };

      const md = generator.generate(doc);

      expect(md).toContain('**Status**: Beta');
    });

    it('should include hierarchy breadcrumb', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        hierarchy: ['UIKit', 'UIView', 'UIWindow'],
      };

      const md = generator.generate(doc);

      expect(md).toContain('> UIKit > UIView > UIWindow');
    });

    it('should include abstract', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        abstract: "A window object displays the app's content.",
      };

      const md = generator.generate(doc);

      expect(md).toContain("A window object displays the app's content.");
    });

    it('should render Swift code declaration', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        declaration: 'class UIWindow : UIView',
      };

      const md = generator.generate(doc);

      expect(md).toContain('## Declaration');
      expect(md).toContain('```swift');
      expect(md).toContain('class UIWindow : UIView');
      expect(md).toContain('```');
    });

    it('should render Objective-C code declaration', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'objc',
        declaration: '@interface UIWindow : UIView',
      };

      const md = generator.generate(doc);

      expect(md).toContain('```objectivec');
      expect(md).toContain('@interface UIWindow : UIView');
    });

    it('should include overview section', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        overview: 'Windows are used to display content on screen.',
      };

      const md = generator.generate(doc);

      expect(md).toContain('## Overview');
      expect(md).toContain('Windows are used to display content on screen.');
    });

    it('should render parameters', () => {
      const doc: ParsedDocumentation = {
        title: 'init(frame:)',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        parameters: [
          { name: 'frame', description: 'The frame rectangle for the window.' },
          { name: 'style', description: 'The style of the window.' },
        ],
      };

      const md = generator.generate(doc);

      expect(md).toContain('## Parameters');
      expect(md).toContain('- **frame**: The frame rectangle for the window.');
      expect(md).toContain('- **style**: The style of the window.');
    });

    it('should include return value', () => {
      const doc: ParsedDocumentation = {
        title: 'makeKeyAndVisible()',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        returnValue: 'Returns the newly created window.',
      };

      const md = generator.generate(doc);

      expect(md).toContain('## Return Value');
      expect(md).toContain('Returns the newly created window.');
    });

    it('should render topics with links', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        topics: [
          {
            title: 'Properties',
            items: [
              { title: 'rootViewController', url: './rootViewController.md', abstract: 'The root view controller.' },
              { title: 'windowLevel', url: './windowLevel.md' },
            ],
          },
        ],
      };

      const md = generator.generate(doc);

      expect(md).toContain('## Topics');
      expect(md).toContain('### Properties');
      expect(md).toContain('[rootViewController](./rootViewController.md)');
      expect(md).toContain(': The root view controller.');
      expect(md).toContain('[windowLevel](./windowLevel.md)');
    });

    it('should render topics without links', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        topics: [
          {
            title: 'Properties',
            items: [{ title: 'rootViewController' }],
          },
        ],
      };

      const md = generator.generate(doc);

      expect(md).toContain('- rootViewController');
      expect(md).not.toContain('[rootViewController]');
    });

    it('should mark required items', () => {
      const doc: ParsedDocumentation = {
        title: 'UIViewControllerTransitioningDelegate',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        topics: [
          {
            title: 'Methods',
            items: [{ title: 'animationController', required: true }],
          },
        ],
      };

      const md = generator.generate(doc);

      expect(md).toContain('*(Required)*');
    });

    it('should mark deprecated items', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        topics: [
          {
            title: 'Properties',
            items: [{ title: 'oldProperty', deprecated: true }],
          },
        ],
      };

      const md = generator.generate(doc);

      expect(md).toContain('*(Deprecated)*');
    });

    it('should render relationships', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        relationships: [
          {
            kind: 'inheritsFrom',
            title: 'Inherits From',
            items: [{ title: 'UIView', url: '../UIView.md' }],
          },
        ],
      };

      const md = generator.generate(doc);

      expect(md).toContain('## Relationships');
      expect(md).toContain('### Inherits From');
      expect(md).toContain('[UIView](../UIView.md)');
    });

    it('should render see also section', () => {
      const doc: ParsedDocumentation = {
        title: 'UIWindow',
        kind: 'symbol',
        role: 'symbol',
        language: 'swift',
        seeAlso: [
          {
            title: 'Related',
            items: [{ title: 'UIScreen', url: './UIScreen.md' }],
          },
        ],
      };

      const md = generator.generate(doc);

      expect(md).toContain('## See Also');
      expect(md).toContain('### Related');
      expect(md).toContain('[UIScreen](./UIScreen.md)');
    });
  });

  describe('generateIndex', () => {
    it('should generate index with title', () => {
      const md = generator.generateIndex('UIKit');

      expect(md).toContain('# UIKit');
    });

    it('should include description', () => {
      const md = generator.generateIndex('UIKit', 'Documentation for UIKit framework.');

      expect(md).toContain('Documentation for UIKit framework.');
    });

    it('should render items list', () => {
      const items = [
        { title: 'UIWindow', url: './UIWindow.md', abstract: 'A window object.' },
        { title: 'UIView', url: './UIView.md' },
      ];

      const md = generator.generateIndex('UIKit', 'Documentation', items);

      expect(md).toContain('## Contents');
      expect(md).toContain('[UIWindow](./UIWindow.md)');
      expect(md).toContain(': A window object.');
      expect(md).toContain('[UIView](./UIView.md)');
    });

    it('should handle empty items', () => {
      const md = generator.generateIndex('UIKit', 'Description', []);

      expect(md).toContain('# UIKit');
      expect(md).toContain('Description');
      expect(md).not.toContain('## Contents');
    });
  });
});
