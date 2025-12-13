/**
 * @file DocCParser.ts
 * @module parser/DocCParser
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Parses Apple DocC JSON format into structured documentation data.
 */

import type {
  DocCDocument,
  ParsedDocumentation,
  TopicItem,
  BlockContent,
  InlineContent,
  ContentSection,
  Declaration,
  Reference,
  Platform,
} from './types.js';

/**
 * Parses DocC JSON documents into ParsedDocumentation.
 *
 * The parser extracts:
 * - Metadata (title, framework, platforms)
 * - Code declarations
 * - Overview content (prose, code blocks, lists)
 * - Parameters and return values
 * - Topic sections and relationships
 * - Reference links
 *
 * URL-to-path mappings can be registered for accurate link resolution.
 *
 * @example
 * ```typescript
 * const parser = new DocCParser();
 * const doc = extractor.extractByRequestKey('ls/documentation/uikit/uiwindow');
 * const parsed = parser.parse(doc, 'swift');
 * console.log(parsed.title, parsed.declaration);
 * ```
 */
/**
 * Lookup function to determine which languages a documentation path is available in.
 * Returns a Set of languages ('swift', 'objc') or undefined if not found.
 */
export type LanguageAvailabilityLookup = (docPath: string) => Set<'swift' | 'objc'> | undefined;

export class DocCParser {
  private urlToPathMap: Map<string, string> = new Map();
  private sourceDocumentPath: string | null = null;
  private sourceLanguage: 'swift' | 'objc' = 'swift';
  private languageLookup: LanguageAvailabilityLookup | null = null;

  /**
   * Set the language availability lookup function for cross-language link resolution.
   * @param lookup - Function that returns available languages for a doc path
   */
  setLanguageAvailabilityLookup(lookup: LanguageAvailabilityLookup): void {
    this.languageLookup = lookup;
  }

  /**
   * Set the source document path for correct relative link resolution.
   * Call this before parsing each document.
   * @param path - Request key path (e.g., 'ls/documentation/xpc/os_xpc_listener')
   * @param language - Source document's language
   */
  setSourceDocumentPath(path: string, language: 'swift' | 'objc' = 'swift'): void {
    this.sourceDocumentPath = path;
    this.sourceLanguage = language;
  }

  /**
   * Clear the source document path after parsing.
   */
  clearSourceDocumentPath(): void {
    this.sourceDocumentPath = null;
    this.sourceLanguage = 'swift';
  }

  /**
   * Register a URL to file path mapping for link resolution.
   * @param docUrl - Documentation URL (e.g., doc://com.apple.xxx/documentation/uikit)
   * @param filePath - Corresponding file path in output
   */
  registerPath(docUrl: string, filePath: string): void {
    // Normalize the URL - extract the path part
    const normalized = this.normalizeDocUrl(docUrl);
    if (normalized) {
      this.urlToPathMap.set(normalized, filePath);
    }
  }

  /**
   * Clear all URL to path mappings.
   */
  clearMappings(): void {
    this.urlToPathMap.clear();
  }

  /**
   * Normalize a doc:// URL to a comparable path.
   * @param url - URL to normalize
   * @returns Normalized lowercase path or null if invalid
   */
  private normalizeDocUrl(url: string): string | null {
    // Handle doc://com.apple.xxx/documentation/... format
    const docMatch = url.match(/doc:\/\/[^/]+\/documentation\/(.+)/);
    if (docMatch) {
      return `/documentation/${docMatch[1]}`.toLowerCase();
    }
    // Handle /documentation/... format
    if (url.startsWith('/documentation/')) {
      return url.toLowerCase();
    }
    return null;
  }

  /**
   * Parse a DocC document into a simplified structure for markdown generation.
   * @param doc - DocC JSON document from the extractor
   * @param language - Target language (swift or objc)
   * @returns ParsedDocumentation ready for markdown generation
   */
  parse(doc: DocCDocument, language: 'swift' | 'objc'): ParsedDocumentation {
    const metadata = doc.metadata;
    const result: ParsedDocumentation = {
      title: metadata?.title ?? 'Untitled',
      kind: doc.kind,
      role: metadata?.role ?? 'unknown',
      language,
      framework: this.extractFramework(doc),
      platforms: metadata?.platforms,
      abstract: this.renderAbstract(doc.abstract),
      declaration: this.renderDeclaration(doc.primaryContentSections, language),
      overview: this.renderOverview(doc.primaryContentSections, doc.references),
      parameters: this.extractParameters(doc.primaryContentSections, doc.references),
      returnValue: this.extractReturnValue(doc.primaryContentSections, doc.references),
      topics: this.extractTopics(doc.topicSections, doc.references),
      seeAlso: this.extractTopics(doc.seeAlsoSections, doc.references),
      relationships: this.extractRelationships(doc),
      hierarchy: this.extractHierarchy(doc),
      deprecated: metadata?.platforms?.some(p => p.deprecated) ?? false,
      beta: metadata?.platforms?.some(p => p.beta) ?? false,
    };

    return result;
  }

  /**
   * Extract framework name from document metadata or URL.
   */
  private extractFramework(doc: DocCDocument): string | undefined {
    const modules = doc.metadata?.modules;
    if (modules && modules.length > 0) {
      return modules[0].name;
    }

    // Try to extract from identifier URL
    const url = doc.identifier.url;
    const match = url.match(/documentation\/([^/]+)/);
    return match?.[1];
  }

  /**
   * Render abstract section to markdown string.
   */
  private renderAbstract(abstract?: InlineContent[]): string | undefined {
    if (!abstract || abstract.length === 0) {
      return undefined;
    }
    return this.renderInlineContent(abstract);
  }

  /**
   * Render code declaration for the target language.
   */
  private renderDeclaration(sections?: ContentSection[], language?: 'swift' | 'objc'): string | undefined {
    if (!sections) return undefined;

    for (const section of sections) {
      if (section.kind === 'declarations' && section.declarations) {
        for (const decl of section.declarations) {
          // Prefer declaration matching the target language
          if (language && decl.languages) {
            const langMap: Record<string, string> = { swift: 'swift', objc: 'occ' };
            if (!decl.languages.includes(langMap[language])) {
              continue;
            }
          }
          return this.renderDeclarationTokens(decl);
        }
        // Fallback to first declaration
        if (section.declarations.length > 0) {
          return this.renderDeclarationTokens(section.declarations[0]);
        }
      }
    }
    return undefined;
  }

  /**
   * Convert declaration tokens to a code string.
   */
  private renderDeclarationTokens(decl: Declaration): string {
    return decl.tokens.map(t => t.text).join('');
  }

  /**
   * Render overview/content sections to markdown.
   */
  private renderOverview(sections?: ContentSection[], references?: Record<string, Reference>): string | undefined {
    if (!sections) return undefined;

    const contentSections = sections.filter(s => s.kind === 'content' && s.content);
    if (contentSections.length === 0) return undefined;

    const parts: string[] = [];
    for (const section of contentSections) {
      if (section.content) {
        parts.push(this.renderBlockContent(section.content, references));
      }
    }

    return parts.join('\n\n') || undefined;
  }

  /**
   * Extract function/method parameters.
   */
  private extractParameters(
    sections?: ContentSection[],
    references?: Record<string, Reference>
  ): Array<{ name: string; description: string }> | undefined {
    if (!sections) return undefined;

    for (const section of sections) {
      if (section.kind === 'parameters' && section.parameters) {
        return section.parameters.map(p => ({
          name: p.name,
          description: this.renderBlockContent(p.content, references),
        }));
      }
    }
    return undefined;
  }

  /**
   * Extract return value description.
   */
  private extractReturnValue(
    sections?: ContentSection[],
    references?: Record<string, Reference>
  ): string | undefined {
    if (!sections) return undefined;

    for (const section of sections) {
      if (section.kind === 'content' && section.content) {
        // Look for return value content after parameters
        for (const block of section.content) {
          if (block.type === 'heading' && 'text' in block && block.text?.toLowerCase().includes('return')) {
            // Find the content after this heading
            const idx = section.content.indexOf(block);
            const nextBlocks = section.content.slice(idx + 1);
            const returnContent: BlockContent[] = [];
            for (const b of nextBlocks) {
              if (b.type === 'heading') break;
              returnContent.push(b);
            }
            if (returnContent.length > 0) {
              return this.renderBlockContent(returnContent, references);
            }
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Extract topic sections with their items.
   */
  private extractTopics(
    sections?: Array<{ title?: string; identifiers: string[]; generated?: boolean }>,
    references?: Record<string, Reference>
  ): Array<{ title: string; items: TopicItem[] }> | undefined {
    if (!sections || sections.length === 0) return undefined;

    return sections
      .filter(s => s.identifiers.length > 0)
      .map(section => ({
        title: section.title ?? 'Topics',
        items: section.identifiers
          .map(id => this.referenceToTopicItem(id, references))
          .filter((item): item is TopicItem => item !== null),
      }))
      .filter(s => s.items.length > 0);
  }

  /**
   * Extract relationship sections (inheritance, conformance, etc.).
   */
  private extractRelationships(
    doc: DocCDocument
  ): Array<{ kind: string; title: string; items: TopicItem[] }> | undefined {
    const sections = doc.relationshipsSections;
    if (!sections || sections.length === 0) return undefined;

    return sections
      .filter(s => s.identifiers.length > 0)
      .map(section => ({
        kind: section.kind,
        title: section.title,
        items: section.identifiers
          .map(id => this.referenceToTopicItem(id, doc.references))
          .filter((item): item is TopicItem => item !== null),
      }));
  }

  /**
   * Convert a reference identifier to a TopicItem.
   */
  private referenceToTopicItem(
    identifier: string,
    references?: Record<string, Reference>
  ): TopicItem | null {
    const ref = references?.[identifier];
    if (!ref) {
      return null;
    }

    // Resolve the URL to actual file path
    let url: string | undefined = ref.url;
    if (url) {
      const resolvedPath = this.resolveUrl(url, ref.title);
      if (resolvedPath) {
        url = resolvedPath;
      } else if (ref.title) {
        // Build relative path from URL structure (returns null for external HTML links)
        const relativePath = this.buildRelativePathFromUrl(url, ref.title);
        url = relativePath ?? undefined;
      }
    }

    return {
      title: ref.title ?? identifier,
      url,
      abstract: ref.abstract ? this.renderInlineContent(ref.abstract) : undefined,
      required: ref.required,
      deprecated: ref.deprecated,
      beta: ref.beta,
    };
  }

  /**
   * Build a relative path from a documentation URL.
   *
   * Handles same-framework, cross-framework, and cross-language links by:
   * 1. Checking if target exists in current language
   * 2. If not, checking if it exists in another language
   * 3. Computing the appropriate relative path accounting for language directories
   *
   * Directory structure: Language/Framework/path/Item.md
   *   e.g., Swift/UIKit/UIWindow.md or Objective-C/Os/OS_object.md
   *
   * @param url - Target documentation URL path (e.g., '/documentation/swift/equatable')
   * @param title - Display title for the filename
   * @returns Relative path, or null for external HTML links that cannot be resolved
   */
  private buildRelativePathFromUrl(url: string, title: string): string | null {
    // External HTML links (guides, tech notes, legacy docs) cannot be resolved locally
    if (url.includes('.html')) {
      return null;
    }

    // Extract target framework and path from URL
    const targetMatch = url.match(/\/documentation\/([^/]+)(?:\/(.*))?/);
    if (!targetMatch) {
      return `./${this.sanitizeFileName(title)}.md`;
    }

    const targetFramework = targetMatch[1].toLowerCase();
    const targetPathAfterFramework = targetMatch[2] || '';
    const targetPathParts = targetPathAfterFramework
      ? targetPathAfterFramework.split('/')
      : [];

    // Use URL segment for filename (not title) to match actual file naming
    const urlFileName = targetPathParts.length > 0
      ? this.sanitizeFileName(targetPathParts[targetPathParts.length - 1]) + '.md'
      : this.sanitizeFileName(title) + '.md';

    // Extract source framework and path from source document
    let sourceFramework: string | null = null;
    let sourcePathParts: string[] = [];

    if (this.sourceDocumentPath) {
      // Source path format: ls/documentation/framework/path or lc/documentation/framework/path
      const sourceMatch = this.sourceDocumentPath.match(
        /l[sc]\/documentation\/([^/]+)(?:\/(.*))?/
      );
      if (sourceMatch) {
        sourceFramework = sourceMatch[1].toLowerCase();
        const sourcePathAfterFramework = sourceMatch[2] || '';
        sourcePathParts = sourcePathAfterFramework
          ? sourcePathAfterFramework.split('/')
          : [];
      }
    }

    // If we don't have source context, fall back to simple relative path
    if (!sourceFramework) {
      if (targetPathParts.length === 0) {
        return `./${urlFileName}`;
      }
      return `./${targetPathParts.slice(0, -1).join('/')}/${urlFileName}`.replace(
        /\/+/g,
        '/'
      );
    }

    // Determine target language - check if target exists in current language
    const targetDocPath = url.toLowerCase();
    let targetLanguage: 'swift' | 'objc' = this.sourceLanguage;

    if (this.languageLookup) {
      const availableLangs = this.languageLookup(targetDocPath);
      if (availableLangs) {
        if (!availableLangs.has(this.sourceLanguage)) {
          // Target doesn't exist in source language - use the other language
          targetLanguage = this.sourceLanguage === 'swift' ? 'objc' : 'swift';
        }
      }
    }

    // Capitalize framework names for directory paths
    const targetFrameworkDir = this.capitalizeFrameworkName(targetFramework);

    // Cross-language link: need to go up to root and into other language
    if (targetLanguage !== this.sourceLanguage) {
      // Source is at: Language/Framework/path/to/source.md
      // Target is at: OtherLanguage/Framework/path/to/target.md
      // Directory depth within framework = sourcePathParts.length - 1 (excluding filename)
      // Need to go up: directory depth + 1 (to framework) + 1 (to language/root)
      const sourceDirDepth = Math.max(0, sourcePathParts.length - 1);
      const levelsUp = sourceDirDepth + 2;
      const upPath = '../'.repeat(levelsUp);

      // Get target language directory name
      const targetLangDir = targetLanguage === 'swift' ? 'Swift' : 'Objective-C';

      if (targetPathParts.length === 0) {
        // Link to framework root (_index.md)
        return `${upPath}${targetLangDir}/${targetFrameworkDir}/_index.md`;
      }

      // Link to item within target framework in other language
      const targetSubPath = targetPathParts.slice(0, -1).join('/');
      if (targetSubPath) {
        return `${upPath}${targetLangDir}/${targetFrameworkDir}/${targetSubPath}/${urlFileName}`;
      }
      return `${upPath}${targetLangDir}/${targetFrameworkDir}/${urlFileName}`;
    }

    // Same language - cross-framework link
    if (sourceFramework !== targetFramework) {
      // Calculate how many levels to go up from source path to reach Language level
      // Source is at: Language/Framework/path/to/source.md
      // Directory depth within framework = sourcePathParts.length - 1 (excluding filename)
      // Need to go up: directory depth + 1 (to exit current framework into Language level)
      const sourceDirDepth = Math.max(0, sourcePathParts.length - 1);
      const upPath = '../'.repeat(sourceDirDepth + 1);

      if (targetPathParts.length === 0) {
        // Link to framework root (_index.md)
        return `${upPath}${targetFrameworkDir}/_index.md`;
      }

      // Link to item within target framework
      const targetSubPath = targetPathParts.slice(0, -1).join('/');
      if (targetSubPath) {
        return `${upPath}${targetFrameworkDir}/${targetSubPath}/${urlFileName}`;
      }
      return `${upPath}${targetFrameworkDir}/${urlFileName}`;
    }

    // Same framework, same language: compute relative path within framework
    // Note: sourcePathParts includes the source item name, so directory depth = length - 1
    const sourceDirDepth = Math.max(0, sourcePathParts.length - 1);

    if (targetPathParts.length === 0) {
      // Link to framework root (_index.md)
      return sourceDirDepth > 0 ? '../'.repeat(sourceDirDepth) + '_index.md' : './_index.md';
    }

    // Find common directory prefix (excluding file names)
    // sourcePathParts = ['dir1', 'dir2', 'sourceFile']
    // targetPathParts = ['dir1', 'dir2', 'targetFile']
    // We compare directories only: slice(0, -1) for both
    const sourceDirs = sourcePathParts.slice(0, -1);
    const targetDirs = targetPathParts.slice(0, -1);

    let commonPrefixLength = 0;
    const minLen = Math.min(sourceDirs.length, targetDirs.length);
    for (let i = 0; i < minLen; i++) {
      if (sourceDirs[i].toLowerCase() === targetDirs[i].toLowerCase()) {
        commonPrefixLength++;
      } else {
        break;
      }
    }

    // Calculate path: go up from source directory, then down to target directory
    const levelsUp = sourceDirs.length - commonPrefixLength;
    const downDirs = targetDirs.slice(commonPrefixLength);

    const upPath = levelsUp > 0 ? '../'.repeat(levelsUp) : './';
    const downPath = downDirs.join('/');

    if (downPath) {
      return `${upPath}${downPath}/${urlFileName}`;
    }
    return `${upPath}${urlFileName}`;
  }

  /**
   * Capitalize framework name for directory path.
   * Must match the capitalization used by PathResolver and validate-links.ts.
   */
  private capitalizeFrameworkName(name: string): string {
    const knownFrameworks: Record<string, string> = {
      accelerate: 'Accelerate',
      foundation: 'Foundation',
      uikit: 'UIKit',
      appkit: 'AppKit',
      swiftui: 'SwiftUI',
      corefoundation: 'CoreFoundation',
      coredata: 'CoreData',
      coregraphics: 'CoreGraphics',
      coreanimation: 'CoreAnimation',
      corelocation: 'CoreLocation',
      avfoundation: 'AVFoundation',
      webkit: 'WebKit',
      mapkit: 'MapKit',
      healthkit: 'HealthKit',
      homekit: 'HomeKit',
      cloudkit: 'CloudKit',
      gamekit: 'GameKit',
      spritekit: 'SpriteKit',
      scenekit: 'SceneKit',
      metalkit: 'MetalKit',
    };
    return knownFrameworks[name] || name.charAt(0).toUpperCase() + name.slice(1);
  }

  /**
   * Extract breadcrumb hierarchy from document.
   */
  private extractHierarchy(doc: DocCDocument): string[] | undefined {
    if (!doc.hierarchy?.paths || doc.hierarchy.paths.length === 0) {
      return undefined;
    }

    // Get the first path and resolve titles
    const path = doc.hierarchy.paths[0];
    return path.map(id => {
      const ref = doc.references[id];
      return ref?.title ?? id;
    });
  }

  /**
   * Render an array of block content to markdown.
   */
  private renderBlockContent(
    content: BlockContent[],
    references?: Record<string, Reference>
  ): string {
    return content
      .map(block => this.renderBlock(block, references))
      .filter(s => s.length > 0)
      .join('\n\n');
  }

  /**
   * Render a single block content element to markdown.
   */
  private renderBlock(block: BlockContent, references?: Record<string, Reference>): string {
    switch (block.type) {
      case 'heading':
        return this.renderHeading(block);
      case 'paragraph':
        return this.renderParagraph(block, references);
      case 'codeListing':
        return this.renderCodeListing(block);
      case 'aside':
        return this.renderAside(block, references);
      case 'unorderedList':
        return this.renderUnorderedList(block, references);
      case 'orderedList':
        return this.renderOrderedList(block, references);
      case 'table':
        return this.renderTable(block, references);
      case 'termList':
        return this.renderTermList(block, references);
      default:
        return '';
    }
  }

  /** Render heading element. */
  private renderHeading(block: { type: 'heading'; level: number; text: string }): string {
    const prefix = '#'.repeat(Math.min(block.level + 1, 6));
    return `${prefix} ${block.text}`;
  }

  /** Render paragraph element. */
  private renderParagraph(
    block: { type: 'paragraph'; inlineContent: InlineContent[] },
    references?: Record<string, Reference>
  ): string {
    return this.renderInlineContent(block.inlineContent, references);
  }

  /** Render code listing as fenced code block. */
  private renderCodeListing(block: {
    type: 'codeListing';
    syntax?: string;
    code: string[];
  }): string {
    const lang = block.syntax ?? '';
    const code = block.code.join('\n');
    return '```' + lang + '\n' + code + '\n```';
  }

  /** Render aside/callout as blockquote. */
  private renderAside(
    block: { type: 'aside'; style: string; name?: string; content: BlockContent[] },
    references?: Record<string, Reference>
  ): string {
    const title = block.name ?? this.asideStyleToTitle(block.style);
    const content = this.renderBlockContent(block.content, references);
    return `> **${title}**: ${content}`;
  }

  /** Convert aside style to display title. */
  private asideStyleToTitle(style: string): string {
    const titles: Record<string, string> = {
      note: 'Note',
      warning: 'Warning',
      important: 'Important',
      tip: 'Tip',
      experiment: 'Experiment',
    };
    return titles[style] ?? 'Note';
  }

  /** Render unordered list. */
  private renderUnorderedList(
    block: { type: 'unorderedList'; items: Array<{ content: BlockContent[] }> },
    references?: Record<string, Reference>
  ): string {
    return block.items
      .map(item => '- ' + this.renderBlockContent(item.content, references).replace(/\n/g, '\n  '))
      .join('\n');
  }

  /** Render ordered list. */
  private renderOrderedList(
    block: { type: 'orderedList'; items: Array<{ content: BlockContent[] }>; start?: number },
    references?: Record<string, Reference>
  ): string {
    const start = block.start ?? 1;
    return block.items
      .map((item, i) => `${start + i}. ` + this.renderBlockContent(item.content, references).replace(/\n/g, '\n   '))
      .join('\n');
  }

  /** Render table as markdown table. */
  private renderTable(
    block: {
      type: 'table';
      header: string;
      rows: Array<{ cells: Array<{ content: BlockContent[] }> }>;
    },
    references?: Record<string, Reference>
  ): string {
    if (block.rows.length === 0) return '';

    const rows = block.rows.map(row =>
      '| ' +
      row.cells.map(cell => this.renderBlockContent(cell.content, references).replace(/\|/g, '\\|')).join(' | ') +
      ' |'
    );

    // Create header separator
    const colCount = block.rows[0]?.cells.length ?? 1;
    const separator = '| ' + Array(colCount).fill('---').join(' | ') + ' |';

    // If there's a header row, use first row as header
    if (rows.length > 0) {
      return [rows[0], separator, ...rows.slice(1)].join('\n');
    }

    return rows.join('\n');
  }

  /** Render term list as definition list. */
  private renderTermList(
    block: {
      type: 'termList';
      items: Array<{ term: InlineContent; definition: InlineContent }>;
    },
    references?: Record<string, Reference>
  ): string {
    return block.items
      .map(item => {
        const term = this.renderInlineContentSingle(item.term, references);
        const def = this.renderInlineContentSingle(item.definition, references);
        return `**${term}**: ${def}`;
      })
      .join('\n\n');
  }

  /**
   * Render an array of inline content to markdown string.
   */
  private renderInlineContent(
    content: InlineContent[],
    references?: Record<string, Reference>
  ): string {
    return content.map(c => this.renderInlineContentSingle(c, references)).join('');
  }

  /**
   * Render a single inline content element.
   */
  private renderInlineContentSingle(
    content: InlineContent,
    references?: Record<string, Reference>
  ): string {
    switch (content.type) {
      case 'text':
        return content.text;
      case 'codeVoice':
        return '`' + content.code + '`';
      case 'reference':
        return this.renderReference(content, references);
      case 'emphasis':
        return '*' + this.renderInlineContent(content.inlineContent, references) + '*';
      case 'strong':
        return '**' + this.renderInlineContent(content.inlineContent, references) + '**';
      case 'newTerm':
        return '*' + this.renderInlineContent(content.inlineContent, references) + '*';
      case 'inlineHead':
        return '**' + this.renderInlineContent(content.inlineContent, references) + '**';
      case 'subscript':
        return this.renderInlineContent(content.inlineContent, references);
      case 'superscript':
        return this.renderInlineContent(content.inlineContent, references);
      case 'strikethrough':
        return '~~' + this.renderInlineContent(content.inlineContent, references) + '~~';
      case 'image':
        return this.renderImageRef(content.identifier, references);
      default:
        return '';
    }
  }

  /**
   * Render a reference as a markdown link.
   */
  private renderReference(
    content: { type: 'reference'; identifier: string; isActive?: boolean; overridingTitle?: string },
    references?: Record<string, Reference>
  ): string {
    const ref = references?.[content.identifier];
    const title = content.overridingTitle ?? ref?.title ?? content.identifier;

    if (ref?.url && content.isActive !== false) {
      // Try to resolve to actual file path using our mapping
      const resolvedPath = this.resolveUrl(ref.url, ref.title);
      if (resolvedPath) {
        return `[${title}](${resolvedPath})`;
      }
      // Fallback: build relative path from URL structure
      if (ref.title) {
        const relativePath = this.buildRelativePathFromUrl(ref.url, ref.title);
        if (relativePath) {
          return `[${title}](${relativePath})`;
        }
        // External HTML link - render as plain text
      }
    }

    return title;
  }

  /** Render image reference as markdown image. */
  private renderImageRef(identifier: string, references?: Record<string, Reference>): string {
    const ref = references?.[identifier];
    if (ref?.type === 'image' && ref.variants && ref.variants.length > 0) {
      const variant = ref.variants[0];
      const alt = ref.alt ?? 'Image';
      return `![${alt}](${variant.url})`;
    }
    return '';
  }

  /**
   * Resolve a documentation URL to a file path using registered mappings.
   */
  private resolveUrl(url: string, title?: string): string | null {
    // First try to find in our registered mappings
    const normalized = this.normalizeDocUrl(url);
    if (normalized) {
      const mapped = this.urlToPathMap.get(normalized);
      if (mapped) {
        return mapped;
      }
    }
    return null;
  }

  /**
   * Sanitize a string for use as a filename.
   * Converts method signatures to unique filenames.
   */
  private sanitizeFileName(name: string): string {
    let sanitized = name;

    // Handle method signatures: convert parameters to underscore-separated format
    // e.g., init(frame:) → init_frame, perform(_:with:afterDelay:) → perform_with_afterdelay
    if (sanitized.includes('(')) {
      const parenIndex = sanitized.indexOf('(');
      const methodName = sanitized.substring(0, parenIndex);
      const paramsSection = sanitized.substring(parenIndex);

      // Extract parameter labels from signature
      const paramLabels = paramsSection
        .replace(/[()]/g, '')  // Remove parentheses
        .split(':')            // Split by colons
        .map(p => p.trim().split(/\s+/).pop() || '')  // Get the label (last word before colon)
        .filter(p => p && p !== '_')  // Remove empty and underscore-only labels
        .join('_');

      sanitized = paramLabels ? `${methodName}_${paramLabels}` : methodName;
    }

    // Remove or replace invalid characters
    sanitized = sanitized
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/__+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Truncate very long names
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100);
    }

    // Ensure non-empty
    if (!sanitized) {
      sanitized = 'unnamed';
    }

    // Lowercase for case-insensitive consistency across filesystems
    // This ensures links and filenames match regardless of the data source
    return sanitized.toLowerCase();
  }
}
