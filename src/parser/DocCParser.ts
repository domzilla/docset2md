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

export class DocCParser {
  private urlToPathMap: Map<string, string> = new Map();

  /**
   * Register a URL to file path mapping for link resolution.
   */
  registerPath(docUrl: string, filePath: string): void {
    // Normalize the URL - extract the path part
    const normalized = this.normalizeDocUrl(docUrl);
    if (normalized) {
      this.urlToPathMap.set(normalized, filePath);
    }
  }

  /**
   * Clear the URL to path mappings.
   */
  clearMappings(): void {
    this.urlToPathMap.clear();
  }

  /**
   * Normalize a doc:// URL to a comparable path.
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

  private renderAbstract(abstract?: InlineContent[]): string | undefined {
    if (!abstract || abstract.length === 0) {
      return undefined;
    }
    return this.renderInlineContent(abstract);
  }

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

  private renderDeclarationTokens(decl: Declaration): string {
    return decl.tokens.map(t => t.text).join('');
  }

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

  private referenceToTopicItem(
    identifier: string,
    references?: Record<string, Reference>
  ): TopicItem | null {
    const ref = references?.[identifier];
    if (!ref) {
      return null;
    }

    // Resolve the URL to actual file path
    let url = ref.url;
    if (url) {
      const resolvedPath = this.resolveUrl(url, ref.title);
      if (resolvedPath) {
        url = resolvedPath;
      } else if (ref.title) {
        // Build relative path from URL structure
        url = this.buildRelativePathFromUrl(url, ref.title);
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
   * e.g., /documentation/uikit/uiwindow/rootviewcontroller -> ./uiwindow/rootViewController.md
   */
  private buildRelativePathFromUrl(url: string, title: string): string {
    // Extract path after /documentation/framework/
    const match = url.match(/\/documentation\/[^/]+\/(.+)/);
    if (!match) {
      return `./${this.sanitizeFileName(title)}.md`;
    }

    const pathParts = match[1].split('/');

    if (pathParts.length <= 1) {
      // Top-level item (like a class)
      return `./${this.sanitizeFileName(title)}.md`;
    }

    // For nested items, build the subdirectory path
    // e.g., uiwindow/rootviewcontroller -> ./uiwindow/rootViewController.md
    const dirParts = pathParts.slice(0, -1); // All but last
    const fileName = this.sanitizeFileName(title);

    return `./${dirParts.join('/')}/${fileName}.md`;
  }

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

  // Block content rendering
  private renderBlockContent(
    content: BlockContent[],
    references?: Record<string, Reference>
  ): string {
    return content
      .map(block => this.renderBlock(block, references))
      .filter(s => s.length > 0)
      .join('\n\n');
  }

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

  private renderHeading(block: { type: 'heading'; level: number; text: string }): string {
    const prefix = '#'.repeat(Math.min(block.level + 1, 6));
    return `${prefix} ${block.text}`;
  }

  private renderParagraph(
    block: { type: 'paragraph'; inlineContent: InlineContent[] },
    references?: Record<string, Reference>
  ): string {
    return this.renderInlineContent(block.inlineContent, references);
  }

  private renderCodeListing(block: {
    type: 'codeListing';
    syntax?: string;
    code: string[];
  }): string {
    const lang = block.syntax ?? '';
    const code = block.code.join('\n');
    return '```' + lang + '\n' + code + '\n```';
  }

  private renderAside(
    block: { type: 'aside'; style: string; name?: string; content: BlockContent[] },
    references?: Record<string, Reference>
  ): string {
    const title = block.name ?? this.asideStyleToTitle(block.style);
    const content = this.renderBlockContent(block.content, references);
    return `> **${title}**: ${content}`;
  }

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

  private renderUnorderedList(
    block: { type: 'unorderedList'; items: Array<{ content: BlockContent[] }> },
    references?: Record<string, Reference>
  ): string {
    return block.items
      .map(item => '- ' + this.renderBlockContent(item.content, references).replace(/\n/g, '\n  '))
      .join('\n');
  }

  private renderOrderedList(
    block: { type: 'orderedList'; items: Array<{ content: BlockContent[] }>; start?: number },
    references?: Record<string, Reference>
  ): string {
    const start = block.start ?? 1;
    return block.items
      .map((item, i) => `${start + i}. ` + this.renderBlockContent(item.content, references).replace(/\n/g, '\n   '))
      .join('\n');
  }

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

  // Inline content rendering
  private renderInlineContent(
    content: InlineContent[],
    references?: Record<string, Reference>
  ): string {
    return content.map(c => this.renderInlineContentSingle(c, references)).join('');
  }

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
        return `[${title}](${relativePath})`;
      }
    }

    return title;
  }

  private renderImageRef(identifier: string, references?: Record<string, Reference>): string {
    const ref = references?.[identifier];
    if (ref?.type === 'image' && ref.variants && ref.variants.length > 0) {
      const variant = ref.variants[0];
      const alt = ref.alt ?? 'Image';
      return `![${alt}](${variant.url})`;
    }
    return '';
  }

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

  private sanitizeFileName(name: string): string {
    // Remove or replace invalid characters
    let sanitized = name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/__+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Handle method signatures: methodName(_ param: Type) -> methodName
    if (sanitized.includes('(')) {
      sanitized = sanitized.split('(')[0];
    }

    // Truncate very long names
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100);
    }

    // Ensure non-empty
    if (!sanitized) {
      sanitized = 'unnamed';
    }

    return sanitized;
  }
}
