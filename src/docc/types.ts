/**
 * @file types.ts
 * @module docc/types
 * @author Dominic Rodemer
 * @created 2025-12-11
 * @license MIT
 *
 * @fileoverview TypeScript interfaces for Apple DocC JSON schema.
 */

import type { ContentItem } from '../shared/formats/types.js';

/**
 * Item in a topics or relationships section.
 * @deprecated Use ContentItem from formats/types.js instead.
 */
export type TopicItem = ContentItem;

/**
 * Root document structure for a DocC documentation page.
 * Contains all sections of a documentation entry including metadata,
 * content, relationships, and references.
 */
export interface DocCDocument {
  schemaVersion: SchemaVersion;
  kind: string;
  identifier: Identifier;
  metadata?: Metadata;
  abstract?: InlineContent[];
  primaryContentSections?: ContentSection[];
  topicSections?: TopicSection[];
  seeAlsoSections?: TopicSection[];
  relationshipsSections?: RelationshipSection[];
  references: Record<string, Reference>;
  sections?: Section[];
  variants?: Variant[];
  hierarchy?: Hierarchy;
  diffAvailability?: DiffAvailability;
}

/**
 * DocC schema version using semantic versioning.
 */
export interface SchemaVersion {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Unique identifier for a documentation page.
 */
export interface Identifier {
  /** Full URL path to the documentation (e.g., /documentation/uikit/uiwindow) */
  url: string;
  /** Programming language (swift or occ for Objective-C) */
  interfaceLanguage: string;
}

/**
 * Metadata about a documentation entry.
 * Contains information about the symbol's type, availability, and source location.
 */
export interface Metadata {
  /** Display title for the documentation page */
  title: string;
  /** Role of this page (e.g., symbol, collection, article) */
  role: string;
  /** Heading text describing the role (e.g., Class, Protocol) */
  roleHeading?: string;
  /** Frameworks this symbol belongs to */
  modules?: Module[];
  /** Platform availability information */
  platforms?: Platform[];
  /** External identifier for cross-referencing */
  externalID?: string;
  /** Kind of symbol (e.g., class, struct, func) */
  symbolKind?: string;
  /** Declaration fragments for syntax highlighting */
  fragments?: Fragment[];
  /** Title fragments for navigation display */
  navigatorTitle?: Fragment[];
  /** Whether this symbol is required (for protocol members) */
  required?: boolean;
  /** Protocol conformance information */
  conformance?: Conformance;
  /** URI to the source file */
  sourceFileURI?: string;
  /** Remote source repository information */
  remoteSource?: RemoteSource;
}

/**
 * Framework/module information.
 */
export interface Module {
  /** Framework name (e.g., UIKit, Foundation) */
  name: string;
  /** Related modules this depends on or extends */
  relatedModules?: RelatedModule[];
}

/**
 * Related module reference.
 */
export interface RelatedModule {
  name: string;
}

/**
 * Platform availability information.
 * Describes which OS versions support a symbol.
 */
export interface Platform {
  /** Platform name (e.g., iOS, macOS, watchOS) */
  name: string;
  /** Version when the symbol was introduced */
  introducedAt?: string;
  /** Current version of the platform */
  current?: string;
  /** Whether the symbol is deprecated */
  deprecated?: boolean;
  /** Version when the symbol was deprecated */
  deprecatedAt?: string;
  /** Whether this is a beta API */
  beta?: boolean;
}

/**
 * Code fragment for syntax-highlighted display.
 * Used in declarations and navigator titles.
 */
export interface Fragment {
  /** Fragment kind (text, keyword, identifier, etc.) */
  kind: string;
  /** The text content */
  text: string;
  /** Reference identifier for linked symbols */
  identifier?: string;
  /** Precise identifier for symbol resolution */
  preciseIdentifier?: string;
}

/**
 * Protocol conformance information.
 */
export interface Conformance {
  /** Availability requirement text */
  availabilityPrefix?: InlineContent[];
  /** Conformance description prefix */
  conformancePrefix?: InlineContent[];
  /** Generic constraints for the conformance */
  constraints?: InlineContent[];
}

/**
 * Remote source repository reference.
 */
export interface RemoteSource {
  /** URL to the source repository */
  url: string;
  /** Name of the source file */
  fileName: string;
}

/**
 * A section of primary content in a documentation page.
 * Can contain prose content, declarations, or parameter lists.
 */
export interface ContentSection {
  /** Section kind (content, declarations, parameters) */
  kind: string;
  /** Block content for prose sections */
  content?: BlockContent[];
  /** Code declarations for symbol documentation */
  declarations?: Declaration[];
  /** Parameter documentation for functions/methods */
  parameters?: Parameter[];
  /** Definition list items */
  items?: DefinitionListItem[];
}

/**
 * Code declaration with platform and language information.
 */
export interface Declaration {
  /** Platforms this declaration applies to */
  platforms?: string[];
  /** Languages for this declaration (swift, occ) */
  languages?: string[];
  /** Tokenized declaration for syntax highlighting */
  tokens: DeclarationToken[];
}

/**
 * Individual token in a code declaration.
 */
export interface DeclarationToken {
  /** Token kind (keyword, identifier, text, etc.) */
  kind: string;
  /** The token text */
  text: string;
  /** Reference identifier for linked types */
  identifier?: string;
  /** Precise identifier for symbol resolution */
  preciseIdentifier?: string;
}

/**
 * Function/method parameter documentation.
 */
export interface Parameter {
  /** Parameter name */
  name: string;
  /** Parameter description as block content */
  content: BlockContent[];
}

/**
 * Term-definition pair for definition lists.
 */
export interface DefinitionListItem {
  /** The term being defined */
  term: InlineContent;
  /** The definition */
  definition: InlineContent;
}

/**
 * Section containing related topic links.
 */
export interface TopicSection {
  /** Section title (e.g., "Initializers", "Properties") */
  title?: string;
  /** Reference identifiers for linked items */
  identifiers: string[];
  /** Whether this section was auto-generated */
  generated?: boolean;
  /** Anchor for deep linking */
  anchor?: string;
}

/**
 * Section describing type relationships.
 */
export interface RelationshipSection {
  /** Relationship kind (inheritsFrom, conformsTo, etc.) */
  kind: string;
  /** Section title */
  title: string;
  /** Reference identifiers for related types */
  identifiers: string[];
}

/**
 * Reference to another documentation page or asset.
 * Can represent symbols, articles, or images.
 */
export interface Reference {
  /** Reference type (topic, link, image) */
  type: string;
  /** Unique identifier for this reference */
  identifier: string;
  /** Display title */
  title?: string;
  /** URL path to the referenced item */
  url?: string;
  /** Kind of referenced item (symbol, article) */
  kind?: string;
  /** Role of referenced item */
  role?: string;
  /** Summary description */
  abstract?: InlineContent[];
  /** Declaration fragments for symbol references */
  fragments?: Fragment[];
  /** Title for navigator display */
  navigatorTitle?: Fragment[];
  /** Whether this is a required protocol member */
  required?: boolean;
  /** Protocol conformance info */
  conformance?: Conformance;
  /** Number of default implementations */
  defaultImplementations?: number;
  /** Whether this is a beta API */
  beta?: boolean;
  /** Whether this is deprecated */
  deprecated?: boolean;
  /** Alt text for image references */
  alt?: string;
  /** Image variants at different resolutions */
  variants?: ImageVariant[];
}

/**
 * Image variant at a specific resolution.
 */
export interface ImageVariant {
  /** URL to the image */
  url: string;
  /** Traits (e.g., 1x, 2x, dark) */
  traits: string[];
}

/**
 * Generic content section.
 */
export interface Section {
  /** Section kind */
  kind: string;
  /** Section title */
  title?: string;
  /** Referenced item identifiers */
  identifiers?: string[];
  /** Section content */
  content?: BlockContent[];
}

/**
 * Documentation variant for different languages.
 */
export interface Variant {
  /** Paths to variant pages */
  paths: string[];
  /** Traits describing this variant */
  traits: VariantTrait[];
}

/**
 * Trait identifying a documentation variant.
 */
export interface VariantTrait {
  /** Programming language for this variant */
  interfaceLanguage: string;
}

/**
 * Symbol hierarchy/breadcrumb paths.
 */
export interface Hierarchy {
  /** Array of paths from root to this symbol */
  paths: string[][];
}

/**
 * API diff availability across versions.
 */
export interface DiffAvailability {
  [key: string]: {
    /** Type of change (added, modified, deprecated) */
    change: string;
    /** Platform name */
    platform: string;
    /** Affected versions */
    versions: string[];
  };
}

/**
 * Union type of all block-level content elements.
 * Block content represents structural elements like paragraphs, lists, and code blocks.
 */
export type BlockContent =
  | HeadingContent
  | ParagraphContent
  | CodeListingContent
  | AsideContent
  | UnorderedListContent
  | OrderedListContent
  | TableContent
  | TermListContent
  | RowContent
  | TabNavigatorContent
  | LinksContent
  | VideoContent
  | EndpointExampleContent;

/** Heading element with level and anchor. */
export interface HeadingContent {
  type: 'heading';
  /** Heading level (1-6) */
  level: number;
  /** Heading text */
  text: string;
  /** Anchor for deep linking */
  anchor?: string;
}

/** Paragraph containing inline content. */
export interface ParagraphContent {
  type: 'paragraph';
  /** Inline elements within the paragraph */
  inlineContent: InlineContent[];
}

/** Code listing/snippet with syntax highlighting. */
export interface CodeListingContent {
  type: 'codeListing';
  /** Language syntax for highlighting (swift, objectivec, etc.) */
  syntax?: string;
  /** Lines of code */
  code: string[];
  /** Additional metadata about the code */
  metadata?: {
    abstract?: InlineContent[];
    fileName?: string;
    fileType?: string;
  };
}

/** Callout/aside box (note, warning, tip, etc.). */
export interface AsideContent {
  type: 'aside';
  /** Aside style: 'note', 'warning', 'important', 'tip', 'experiment' */
  style: string;
  /** Custom name for the aside */
  name?: string;
  /** Content within the aside */
  content: BlockContent[];
}

/** Unordered (bulleted) list. */
export interface UnorderedListContent {
  type: 'unorderedList';
  items: ListItem[];
}

/** Ordered (numbered) list. */
export interface OrderedListContent {
  type: 'orderedList';
  items: ListItem[];
  /** Starting number for the list */
  start?: number;
}

/** Item in a list. */
export interface ListItem {
  content: BlockContent[];
}

/** Table element. */
export interface TableContent {
  type: 'table';
  /** Table header mode */
  header: string;
  /** Table rows */
  rows: TableRow[];
  /** Additional metadata */
  metadata?: {
    anchor?: string;
    title?: string;
  };
}

/** Row in a table. */
export interface TableRow {
  cells: TableCell[];
}

/** Cell in a table row. */
export interface TableCell {
  content: BlockContent[];
}

/** Definition/term list (dl/dt/dd). */
export interface TermListContent {
  type: 'termList';
  items: DefinitionListItem[];
}

/** Grid row for multi-column layouts. */
export interface RowContent {
  type: 'row';
  numberOfColumns: number;
  columns: ColumnContent[];
}

/** Column in a grid row. */
export interface ColumnContent {
  /** Column width (relative units) */
  size: number;
  content: BlockContent[];
}

/** Tabbed content navigator. */
export interface TabNavigatorContent {
  type: 'tabNavigator';
  tabs: TabContent[];
}

/** Individual tab in a tab navigator. */
export interface TabContent {
  title: string;
  content: BlockContent[];
}

/** Links section with a specific display style. */
export interface LinksContent {
  type: 'links';
  /** Display style (list, grid, etc.) */
  style: string;
  /** Reference identifiers to link to */
  items: string[];
}

/** Embedded video content. */
export interface VideoContent {
  type: 'video';
  /** Reference identifier for the video */
  identifier: string;
  metadata?: {
    abstract?: InlineContent[];
    /** Device frame to display video in */
    deviceFrame?: string;
  };
}

/** REST API endpoint example. */
export interface EndpointExampleContent {
  type: 'endpointExample';
  /** Summary of the endpoint */
  summary?: InlineContent[];
  /** Request example */
  request: EndpointRequest;
  /** Response example */
  response: EndpointResponse;
}

/** REST endpoint request. */
export interface EndpointRequest {
  type: string;
  content: BlockContent[];
}

/** REST endpoint response. */
export interface EndpointResponse {
  type: string;
  content: BlockContent[];
  /** HTTP status code */
  status: number;
  /** HTTP status reason */
  reason?: string;
}

/**
 * Union type of all inline content elements.
 * Inline content represents text-level elements like emphasis, code, and links.
 */
export type InlineContent =
  | TextContent
  | CodeVoiceContent
  | ReferenceContent
  | ImageContent
  | EmphasisContent
  | StrongContent
  | NewTermContent
  | InlineHeadContent
  | SubscriptContent
  | SuperscriptContent
  | StrikethroughContent;

/** Plain text content. */
export interface TextContent {
  type: 'text';
  text: string;
}

/** Inline code (monospace text). */
export interface CodeVoiceContent {
  type: 'codeVoice';
  code: string;
}

/** Reference/link to another documentation page. */
export interface ReferenceContent {
  type: 'reference';
  /** Reference identifier */
  identifier: string;
  /** Whether the link should be clickable */
  isActive?: boolean;
  /** Custom display title */
  overridingTitle?: string;
  /** Custom title as inline content */
  overridingTitleInlineContent?: InlineContent[];
}

/** Inline image. */
export interface ImageContent {
  type: 'image';
  /** Reference identifier for the image */
  identifier: string;
  metadata?: {
    anchor?: string;
    title?: string;
  };
}

/** Emphasized (italic) text. */
export interface EmphasisContent {
  type: 'emphasis';
  inlineContent: InlineContent[];
}

/** Strong (bold) text. */
export interface StrongContent {
  type: 'strong';
  inlineContent: InlineContent[];
}

/** New term introduction (typically displayed in italics). */
export interface NewTermContent {
  type: 'newTerm';
  inlineContent: InlineContent[];
}

/** Inline heading/label (typically bold). */
export interface InlineHeadContent {
  type: 'inlineHead';
  inlineContent: InlineContent[];
}

/** Subscript text. */
export interface SubscriptContent {
  type: 'subscript';
  inlineContent: InlineContent[];
}

/** Superscript text. */
export interface SuperscriptContent {
  type: 'superscript';
  inlineContent: InlineContent[];
}

/** Strikethrough text. */
export interface StrikethroughContent {
  type: 'strikethrough';
  inlineContent: InlineContent[];
}

/**
 * Entry from the docSet.dsidx SQLite database.
 * Represents a single documentation item in the search index.
 */
export interface IndexEntry {
  /** Database row ID */
  id: number;
  /** Symbol name */
  name: string;
  /** Entry type (Class, Method, Property, etc.) */
  type: string;
  /** Full path/URL including query parameters */
  path: string;
  /** Request key for content lookup (e.g., ls/documentation/uikit/uiwindow) */
  requestKey: string;
  /** Programming language: swift or objc */
  language: 'swift' | 'objc';
}

/**
 * Cache reference from cache.db.
 * Maps a UUID to a location in the compressed fs/ files.
 */
export interface CacheRef {
  /** UUID generated from the request key */
  uuid: string;
  /** ID of the data file in fs/ directory */
  dataId: number;
  /** Byte offset in the decompressed data */
  offset: number;
  /** Length of the JSON content in bytes */
  length: number;
}

/**
 * Parsed documentation ready for markdown generation.
 * A simplified representation of DocC content for output generation.
 */
export interface ParsedDocumentation {
  /** Display title */
  title: string;
  /** Document kind (symbol, article, etc.) */
  kind: string;
  /** Symbol role (class, method, property, etc.) */
  role: string;
  /** Programming language */
  language: 'swift' | 'objc';
  /** Framework name */
  framework?: string;
  /** Platform availability */
  platforms?: Platform[];
  /** Brief description */
  abstract?: string;
  /** Code declaration */
  declaration?: string;
  /** Main documentation content */
  overview?: string;
  /** Function/method parameters */
  parameters?: Array<{ name: string; description: string }>;
  /** Return value description */
  returnValue?: string;
  /** Grouped topic sections */
  topics?: Array<{ title: string; items: TopicItem[] }>;
  /** See Also sections */
  seeAlso?: Array<{ title: string; items: TopicItem[] }>;
  /** Type relationships (inheritance, conformance) */
  relationships?: Array<{ kind: string; title: string; items: TopicItem[] }>;
  /** Breadcrumb path */
  hierarchy?: string[];
  /** Whether the symbol is deprecated */
  deprecated?: boolean;
  /** Whether this is a beta API */
  beta?: boolean;
}

