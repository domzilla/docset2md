/**
 * @file HtmlParser.ts
 * @module shared/HtmlParser
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview Parses HTML documentation pages using cheerio and turndown.
 */

import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import type { ParsedContent } from './formats/types.js';

/**
 * Parses HTML documentation pages into ParsedContent.
 *
 * Supports various HTML structures from different documentation generators.
 * Automatically detects and extracts:
 * - Title from h1, title tag, or meta tags
 * - Abstract from meta description or first paragraph
 * - Code declarations from common selector patterns
 * - Main content converted to markdown
 * - Parameters from definition lists or tables
 *
 * @example
 * ```typescript
 * const parser = new HtmlParser();
 * const content = parser.parse(html, 'array_map', 'Function');
 * console.log(content.title, content.description);
 * ```
 */
export class HtmlParser {
  private turndown: TurndownService;

  /**
   * Create a new HtmlParser with preconfigured turndown rules.
   */
  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    // Custom rule for code blocks with language hints
    this.turndown.addRule('codeBlocks', {
      filter: (node) => {
        return (
          node.nodeName === 'PRE' &&
          node.firstChild !== null &&
          node.firstChild.nodeName === 'CODE'
        );
      },
      replacement: (content, node) => {
        const codeNode = node.firstChild as HTMLElement;
        const className = codeNode?.className || '';
        const langMatch = className.match(/language-(\w+)/);
        const lang = langMatch ? langMatch[1] : '';
        const code = codeNode?.textContent || content;
        return `\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n`;
      },
    });

    // Remove script and style tags
    this.turndown.remove(['script', 'style', 'noscript']);
  }

  /**
   * Parse HTML content into structured documentation.
   * @param html - HTML content to parse
   * @param name - Entry name (fallback for title)
   * @param type - Entry type (Class, Function, etc.)
   * @returns ParsedContent with extracted documentation
   */
  parse(html: string, name: string, type: string): ParsedContent {
    const $ = cheerio.load(html);

    // Remove navigation, headers, footers
    $('nav, header, footer, .sidebar, .navigation, .menu').remove();

    const title = this.extractTitle($) || name;
    const abstract = this.extractAbstract($);
    const declaration = this.extractDeclaration($);
    const description = this.extractDescription($);
    const parameters = this.extractParameters($);
    const returnValue = this.extractReturnValue($);

    return {
      title,
      type,
      abstract,
      declaration,
      description,
      parameters,
      returnValue,
    };
  }

  /**
   * Extract page title
   */
  private extractTitle($: cheerio.CheerioAPI): string | undefined {
    // Try h1 first
    const h1 = $('h1').first().text().trim();
    if (h1) return h1;

    // Try title tag
    const title = $('title').first().text().trim();
    if (title) {
      // Often titles have " - Site Name" suffix
      return title.split(' - ')[0].split(' | ')[0].trim();
    }

    // Try meta og:title
    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) return ogTitle.trim();

    return undefined;
  }

  /**
   * Extract abstract/description from meta tags or first paragraph
   */
  private extractAbstract($: cheerio.CheerioAPI): string | undefined {
    // Try meta description
    const metaDesc = $('meta[name="description"]').attr('content');
    if (metaDesc) return metaDesc.trim();

    // Try og:description
    const ogDesc = $('meta[property="og:description"]').attr('content');
    if (ogDesc) return ogDesc.trim();

    // Try first paragraph after h1
    const h1 = $('h1').first();
    if (h1.length) {
      const nextP = h1.nextAll('p').first();
      if (nextP.length) {
        const text = nextP.text().trim();
        if (text.length > 10 && text.length < 500) {
          return text;
        }
      }
    }

    // Try .description or .summary class
    const descEl = $('.description, .summary, .brief').first();
    if (descEl.length) {
      return descEl.text().trim();
    }

    return undefined;
  }

  /**
   * Extract code declaration/signature
   */
  private extractDeclaration($: cheerio.CheerioAPI): string | undefined {
    // Try declaration-specific classes
    const declSelectors = [
      '.declaration code',
      '.signature code',
      '.prototype code',
      '.methodsynopsis',
      '.funcsynopsis',
      'pre.declaration',
      'pre.signature',
      '.api-signature code',
    ];

    for (const selector of declSelectors) {
      const el = $(selector).first();
      if (el.length) {
        const text = el.text().trim();
        if (text.length > 0 && text.length < 1000) {
          return text;
        }
      }
    }

    // Try first code block if it looks like a declaration
    const firstPre = $('pre code').first();
    if (firstPre.length) {
      const text = firstPre.text().trim();
      // Check if it looks like a declaration (short, contains function/class keywords)
      if (
        text.length < 500 &&
        (text.includes('function') ||
          text.includes('class') ||
          text.includes('def ') ||
          text.includes('void') ||
          text.includes('int ') ||
          text.includes('->'))
      ) {
        return text;
      }
    }

    return undefined;
  }

  /**
   * Extract main description content
   */
  private extractDescription($: cheerio.CheerioAPI): string | undefined {
    // Try main content areas
    const contentSelectors = [
      'main',
      'article',
      '.content',
      '.documentation',
      '.doc-content',
      '#content',
      '.main-content',
    ];

    let contentEl: ReturnType<typeof $> | null = null;

    for (const selector of contentSelectors) {
      const el = $(selector).first();
      if (el.length && el.text().trim().length > 100) {
        contentEl = el;
        break;
      }
    }

    if (!contentEl) {
      // Fall back to body
      contentEl = $('body');
    }

    if (!contentEl || contentEl.length === 0) {
      return undefined;
    }

    // Clone and clean up
    const clone = contentEl.clone();

    // Remove elements we don't want
    clone.find('nav, header, footer, script, style, .sidebar, .navigation').remove();

    // Convert to markdown
    const html = clone.html();
    if (!html) return undefined;

    const markdown = this.turndown.turndown(html);

    // Clean up the markdown
    const cleaned = markdown
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '')
      .trim();

    return cleaned.length > 0 ? cleaned : undefined;
  }

  /**
   * Extract function parameters
   */
  private extractParameters($: cheerio.CheerioAPI): Array<{ name: string; description: string }> | undefined {
    const params: Array<{ name: string; description: string }> = [];

    // Try common parameter table/list formats
    const paramSelectors = [
      '.parameters dt, .parameters dd',
      '.params dt, .params dd',
      '.arguments dt, .arguments dd',
      'table.params tr',
      '.parameter-list li',
    ];

    // Try definition list format
    const dts = $('.parameters dt, .params dt, .arguments dt');
    const dds = $('.parameters dd, .params dd, .arguments dd');

    if (dts.length && dts.length === dds.length) {
      dts.each((i, dt) => {
        const name = $(dt).text().trim();
        const desc = $(dds[i]).text().trim();
        if (name && desc) {
          params.push({ name, description: desc });
        }
      });
    }

    // Try table format
    if (params.length === 0) {
      $('table.params tr, .parameters table tr').each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 2) {
          const name = $(tds[0]).text().trim();
          const desc = $(tds[1]).text().trim();
          if (name && desc) {
            params.push({ name, description: desc });
          }
        }
      });
    }

    return params.length > 0 ? params : undefined;
  }

  /**
   * Extract return value description
   */
  private extractReturnValue($: cheerio.CheerioAPI): string | undefined {
    const returnSelectors = [
      '.return-value',
      '.returns',
      '.return',
      'dt:contains("Return") + dd',
      'dt:contains("Returns") + dd',
    ];

    for (const selector of returnSelectors) {
      const el = $(selector).first();
      if (el.length) {
        const text = el.text().trim();
        if (text.length > 0) {
          return text;
        }
      }
    }

    return undefined;
  }

  /**
   * Convert raw HTML to markdown.
   * @param html - HTML content to convert
   * @returns Markdown string
   */
  htmlToMarkdown(html: string): string {
    return this.turndown.turndown(html);
  }
}
