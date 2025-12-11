// DocC JSON Schema Types

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

export interface SchemaVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface Identifier {
  url: string;
  interfaceLanguage: string;
}

export interface Metadata {
  title: string;
  role: string;
  roleHeading?: string;
  modules?: Module[];
  platforms?: Platform[];
  externalID?: string;
  symbolKind?: string;
  fragments?: Fragment[];
  navigatorTitle?: Fragment[];
  required?: boolean;
  conformance?: Conformance;
  sourceFileURI?: string;
  remoteSource?: RemoteSource;
}

export interface Module {
  name: string;
  relatedModules?: RelatedModule[];
}

export interface RelatedModule {
  name: string;
}

export interface Platform {
  name: string;
  introducedAt?: string;
  current?: string;
  deprecated?: boolean;
  deprecatedAt?: string;
  beta?: boolean;
}

export interface Fragment {
  kind: string;
  text: string;
  identifier?: string;
  preciseIdentifier?: string;
}

export interface Conformance {
  availabilityPrefix?: InlineContent[];
  conformancePrefix?: InlineContent[];
  constraints?: InlineContent[];
}

export interface RemoteSource {
  url: string;
  fileName: string;
}

export interface ContentSection {
  kind: string;
  content?: BlockContent[];
  declarations?: Declaration[];
  parameters?: Parameter[];
  items?: DefinitionListItem[];
}

export interface Declaration {
  platforms?: string[];
  languages?: string[];
  tokens: DeclarationToken[];
}

export interface DeclarationToken {
  kind: string;
  text: string;
  identifier?: string;
  preciseIdentifier?: string;
}

export interface Parameter {
  name: string;
  content: BlockContent[];
}

export interface DefinitionListItem {
  term: InlineContent;
  definition: InlineContent;
}

export interface TopicSection {
  title?: string;
  identifiers: string[];
  generated?: boolean;
  anchor?: string;
}

export interface RelationshipSection {
  kind: string;
  title: string;
  identifiers: string[];
}

export interface Reference {
  type: string;
  identifier: string;
  title?: string;
  url?: string;
  kind?: string;
  role?: string;
  abstract?: InlineContent[];
  fragments?: Fragment[];
  navigatorTitle?: Fragment[];
  required?: boolean;
  conformance?: Conformance;
  defaultImplementations?: number;
  beta?: boolean;
  deprecated?: boolean;
  // Image reference
  alt?: string;
  variants?: ImageVariant[];
}

export interface ImageVariant {
  url: string;
  traits: string[];
}

export interface Section {
  kind: string;
  title?: string;
  identifiers?: string[];
  content?: BlockContent[];
}

export interface Variant {
  paths: string[];
  traits: VariantTrait[];
}

export interface VariantTrait {
  interfaceLanguage: string;
}

export interface Hierarchy {
  paths: string[][];
}

export interface DiffAvailability {
  [key: string]: {
    change: string;
    platform: string;
    versions: string[];
  };
}

// Block Content Types
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

export interface HeadingContent {
  type: 'heading';
  level: number;
  text: string;
  anchor?: string;
}

export interface ParagraphContent {
  type: 'paragraph';
  inlineContent: InlineContent[];
}

export interface CodeListingContent {
  type: 'codeListing';
  syntax?: string;
  code: string[];
  metadata?: {
    abstract?: InlineContent[];
    fileName?: string;
    fileType?: string;
  };
}

export interface AsideContent {
  type: 'aside';
  style: string; // 'note', 'warning', 'important', 'tip', 'experiment'
  name?: string;
  content: BlockContent[];
}

export interface UnorderedListContent {
  type: 'unorderedList';
  items: ListItem[];
}

export interface OrderedListContent {
  type: 'orderedList';
  items: ListItem[];
  start?: number;
}

export interface ListItem {
  content: BlockContent[];
}

export interface TableContent {
  type: 'table';
  header: string;
  rows: TableRow[];
  metadata?: {
    anchor?: string;
    title?: string;
  };
}

export interface TableRow {
  cells: TableCell[];
}

export interface TableCell {
  content: BlockContent[];
}

export interface TermListContent {
  type: 'termList';
  items: TermListItem[];
}

export interface TermListItem {
  term: InlineContent;
  definition: InlineContent;
}

export interface RowContent {
  type: 'row';
  numberOfColumns: number;
  columns: ColumnContent[];
}

export interface ColumnContent {
  size: number;
  content: BlockContent[];
}

export interface TabNavigatorContent {
  type: 'tabNavigator';
  tabs: TabContent[];
}

export interface TabContent {
  title: string;
  content: BlockContent[];
}

export interface LinksContent {
  type: 'links';
  style: string;
  items: string[];
}

export interface VideoContent {
  type: 'video';
  identifier: string;
  metadata?: {
    abstract?: InlineContent[];
    deviceFrame?: string;
  };
}

export interface EndpointExampleContent {
  type: 'endpointExample';
  summary?: InlineContent[];
  request: EndpointRequest;
  response: EndpointResponse;
}

export interface EndpointRequest {
  type: string;
  content: BlockContent[];
}

export interface EndpointResponse {
  type: string;
  content: BlockContent[];
  status: number;
  reason?: string;
}

// Inline Content Types
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

export interface TextContent {
  type: 'text';
  text: string;
}

export interface CodeVoiceContent {
  type: 'codeVoice';
  code: string;
}

export interface ReferenceContent {
  type: 'reference';
  identifier: string;
  isActive?: boolean;
  overridingTitle?: string;
  overridingTitleInlineContent?: InlineContent[];
}

export interface ImageContent {
  type: 'image';
  identifier: string;
  metadata?: {
    anchor?: string;
    title?: string;
  };
}

export interface EmphasisContent {
  type: 'emphasis';
  inlineContent: InlineContent[];
}

export interface StrongContent {
  type: 'strong';
  inlineContent: InlineContent[];
}

export interface NewTermContent {
  type: 'newTerm';
  inlineContent: InlineContent[];
}

export interface InlineHeadContent {
  type: 'inlineHead';
  inlineContent: InlineContent[];
}

export interface SubscriptContent {
  type: 'subscript';
  inlineContent: InlineContent[];
}

export interface SuperscriptContent {
  type: 'superscript';
  inlineContent: InlineContent[];
}

export interface StrikethroughContent {
  type: 'strikethrough';
  inlineContent: InlineContent[];
}

// Index Entry from docSet.dsidx
export interface IndexEntry {
  id: number;
  name: string;
  type: string;
  path: string;
  requestKey: string;
  language: 'swift' | 'objc';
}

// Cache reference from cache.db
export interface CacheRef {
  uuid: string;
  dataId: number;
  offset: number;
  length: number;
}

// Parsed documentation ready for markdown generation
export interface ParsedDocumentation {
  title: string;
  kind: string;
  role: string;
  language: 'swift' | 'objc';
  framework?: string;
  platforms?: Platform[];
  abstract?: string;
  declaration?: string;
  overview?: string;
  parameters?: Array<{ name: string; description: string }>;
  returnValue?: string;
  topics?: Array<{ title: string; items: TopicItem[] }>;
  seeAlso?: Array<{ title: string; items: TopicItem[] }>;
  relationships?: Array<{ kind: string; title: string; items: TopicItem[] }>;
  hierarchy?: string[];
  deprecated?: boolean;
  beta?: boolean;
}

export interface TopicItem {
  title: string;
  url?: string;
  abstract?: string;
  required?: boolean;
  deprecated?: boolean;
  beta?: boolean;
}
