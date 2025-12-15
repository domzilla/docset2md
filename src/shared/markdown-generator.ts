/**
 * @file MarkdownGenerator.ts
 * @module shared/MarkdownGenerator
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Converts parsed documentation into formatted markdown files.
 */

import type { ParsedDocumentation, TopicItem, Platform } from '../docc/types.js';

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

        // Declaration (rendered as plain markdown with type links)
        if (doc.declaration) {
            sections.push('## Declaration');
            sections.push(doc.declaration);
        }

        // Parameters (with proper indentation for multi-line content)
        if (doc.parameters && doc.parameters.length > 0) {
            sections.push('## Parameters');
            sections.push(this.renderParameters(doc.parameters));
        }

        // Content sections (Return Value, Discussion, etc.) - in original order
        if (doc.contentSections && doc.contentSections.length > 0) {
            for (const section of doc.contentSections) {
                sections.push(`## ${section.heading}`);
                sections.push(section.content);
            }
        }

        // Legacy support: Overview (deprecated, use contentSections)
        if (!doc.contentSections && doc.overview) {
            sections.push('## Overview');
            sections.push(doc.overview);
        }

        // Legacy support: Return Value (deprecated, use contentSections)
        if (!doc.contentSections && doc.returnValue) {
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
     * Render parameters with proper indentation for multi-line content.
     *
     * Each parameter is rendered as a list item with the name in bold.
     * Multi-line descriptions are properly indented under the list item,
     * and blank lines are added between parameters for visual separation.
     */
    private renderParameters(params: Array<{ name: string; description: string }>): string {
        return params
            .map(p => {
                const lines = p.description.split('\n');

                // First line includes the parameter name
                const firstLine = `- **${p.name}**: ${lines[0]}`;

                if (lines.length === 1) {
                    return firstLine;
                }

                // Subsequent lines are indented with 2 spaces for proper list continuation
                const restLines = lines.slice(1).map(line => {
                    // Empty lines stay empty (but still count as part of the list item)
                    if (line.trim() === '') {
                        return '';
                    }
                    // Indent non-empty lines
                    return '  ' + line;
                });

                return firstLine + '\n' + restLines.join('\n');
            })
            .join('\n\n'); // Double newline between parameters for visual separation
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
