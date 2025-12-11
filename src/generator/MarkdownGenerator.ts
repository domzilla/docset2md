/**
 * Markdown Generator
 *
 * Converts ParsedDocumentation into formatted markdown files.
 * Handles metadata, declarations, content sections, topics, and relationships.
 *
 * @module generator/MarkdownGenerator
 */

import type { ParsedDocumentation, TopicItem, Platform } from '../parser/types.js';

/**
 * Generates markdown files from parsed documentation.
 *
 * The generator produces markdown with:
 * - Title and metadata (framework, type, platforms)
 * - Hierarchy breadcrumb
 * - Code declarations in fenced blocks
 * - Overview content
 * - Parameters and return values
 * - Topic sections with links
 * - Relationships
 * - See Also sections
 *
 * @example
 * ```typescript
 * const generator = new MarkdownGenerator();
 * const markdown = generator.generate(parsedDoc);
 * fs.writeFileSync('output.md', markdown);
 * ```
 */
export class MarkdownGenerator {
  /**
   * Generate markdown from parsed documentation.
   * @param doc - ParsedDocumentation to convert
   * @returns Complete markdown string
   */
  generate(doc: ParsedDocumentation): string {
    const sections: string[] = [];

    // Title
    sections.push(`# ${doc.title}`);

    // Metadata block
    const metaLines: string[] = [];
    if (doc.framework) {
      metaLines.push(`**Framework**: ${doc.framework}`);
    }
    if (doc.role && doc.role !== 'unknown') {
      metaLines.push(`**Type**: ${this.formatRole(doc.role)}`);
    }
    if (doc.platforms && doc.platforms.length > 0) {
      metaLines.push(`**Platforms**: ${this.formatPlatforms(doc.platforms)}`);
    }
    if (doc.deprecated) {
      metaLines.push('**Status**: Deprecated');
    } else if (doc.beta) {
      metaLines.push('**Status**: Beta');
    }
    if (metaLines.length > 0) {
      sections.push(metaLines.join('  \n'));
    }

    // Hierarchy/breadcrumb
    if (doc.hierarchy && doc.hierarchy.length > 1) {
      sections.push(`> ${doc.hierarchy.join(' > ')}`);
    }

    // Abstract
    if (doc.abstract) {
      sections.push(doc.abstract);
    }

    // Declaration
    if (doc.declaration) {
      const lang = doc.language === 'swift' ? 'swift' : 'objectivec';
      sections.push('## Declaration');
      sections.push('```' + lang + '\n' + doc.declaration + '\n```');
    }

    // Overview
    if (doc.overview) {
      sections.push('## Overview');
      sections.push(doc.overview);
    }

    // Parameters
    if (doc.parameters && doc.parameters.length > 0) {
      sections.push('## Parameters');
      const paramLines = doc.parameters.map(p => `- **${p.name}**: ${p.description}`);
      sections.push(paramLines.join('\n'));
    }

    // Return Value
    if (doc.returnValue) {
      sections.push('## Return Value');
      sections.push(doc.returnValue);
    }

    // Topics
    if (doc.topics && doc.topics.length > 0) {
      sections.push('## Topics');
      for (const topic of doc.topics) {
        sections.push(`### ${topic.title}`);
        sections.push(this.renderTopicItems(topic.items));
      }
    }

    // Relationships
    if (doc.relationships && doc.relationships.length > 0) {
      sections.push('## Relationships');
      for (const rel of doc.relationships) {
        sections.push(`### ${rel.title}`);
        sections.push(this.renderTopicItems(rel.items));
      }
    }

    // See Also
    if (doc.seeAlso && doc.seeAlso.length > 0) {
      sections.push('## See Also');
      for (const seeAlso of doc.seeAlso) {
        if (seeAlso.title !== 'Topics') {
          sections.push(`### ${seeAlso.title}`);
        }
        sections.push(this.renderTopicItems(seeAlso.items));
      }
    }

    return sections.join('\n\n');
  }

  /**
   * Format role into human-readable type name.
   */
  private formatRole(role: string): string {
    const roleMap: Record<string, string> = {
      collection: 'Framework',
      collectionGroup: 'Collection',
      symbol: 'Symbol',
      article: 'Article',
      sampleCode: 'Sample Code',
      dictionarySymbol: 'Dictionary',
      restRequestSymbol: 'REST Request',
    };
    return roleMap[role] ?? role;
  }

  /**
   * Format platforms into display string.
   */
  private formatPlatforms(platforms: Platform[]): string {
    return platforms
      .map(p => {
        let str = p.name;
        if (p.introducedAt) {
          str += ` ${p.introducedAt}+`;
        }
        if (p.deprecated) {
          str += ' (deprecated)';
        }
        if (p.beta) {
          str += ' (beta)';
        }
        return str;
      })
      .join(', ');
  }

  /**
   * Render topic items as markdown list.
   */
  private renderTopicItems(items: TopicItem[]): string {
    return items
      .map(item => {
        let line = '- ';

        if (item.url) {
          line += `[${item.title}](${item.url})`;
        } else {
          line += item.title;
        }

        // Add markers
        const markers: string[] = [];
        if (item.required) markers.push('Required');
        if (item.deprecated) markers.push('Deprecated');
        if (item.beta) markers.push('Beta');
        if (markers.length > 0) {
          line += ` *(${markers.join(', ')})*`;
        }

        // Add abstract
        if (item.abstract) {
          line += `: ${item.abstract}`;
        }

        return line;
      })
      .join('\n');
  }

  /**
   * Generate an index file for a directory of documentation.
   * @param title - Page title
   * @param description - Optional description text
   * @param items - Optional list of items to include
   * @returns Markdown string for index page
   */
  generateIndex(title: string, description?: string, items?: TopicItem[]): string {
    const sections: string[] = [];

    sections.push(`# ${title}`);

    if (description) {
      sections.push(description);
    }

    if (items && items.length > 0) {
      sections.push('## Contents');
      sections.push(this.renderTopicItems(items));
    }

    return sections.join('\n\n');
  }
}
