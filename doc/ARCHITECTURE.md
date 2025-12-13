# Architecture Overview

This document describes the internal architecture of docset2md, a CLI tool that converts documentation docsets to Markdown files.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLI (index.ts)                             │
│                         Command parsing & orchestration                  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Format Detection Layer                          │
│                          (formats/FormatRegistry)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│   Apple DocC        │   │   Standard Dash     │   │   CoreData          │
│   Format Handler    │   │   Format Handler    │   │   Format Handler    │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
              │                       │                       │
              └───────────────────────┼───────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Converter Layer                                 │
│                      (converter/ConverterRegistry)                       │
│              ┌──────────────┬──────────────┬──────────────┐             │
│              │AppleConverter│StandardDash  │CoreData      │             │
│              │              │Converter     │Converter     │             │
│              └──────────────┴──────────────┴──────────────┘             │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Content Extraction                              │
│              (extractor/ContentExtractor, TarixExtractor)               │
│                    (downloader/AppleApiDownloader)                      │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            Parsing Layer                                │
│                    (parser/DocCParser, HtmlParser)                      │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Markdown Generation                              │
│                     (generator/MarkdownGenerator)                       │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          File Output                                    │
│                   (writer/FileWriter, PathResolver)                     │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ (optional --validate)
┌─────────────────────────────────────────────────────────────────────────┐
│                        Link Validation                                  │
│                     (validator/LinkValidator)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/
├── index.ts                 # CLI entry point and orchestration
├── converter/               # Conversion orchestration layer
│   ├── types.ts             # DocsetConverter interface and types
│   ├── BaseConverter.ts     # Abstract base with shared conversion logic
│   ├── AppleConverter.ts    # Apple DocC: language/framework/item.md
│   ├── StandardDashConverter.ts # Standard Dash: type/item.md
│   ├── CoreDataConverter.ts # CoreData: extends StandardDashConverter
│   └── ConverterRegistry.ts # Maps formats to converters
├── db/                      # Database readers for SQLite indexes
│   ├── IndexReader.ts       # Reads docSet.dsidx searchIndex table
│   └── CacheReader.ts       # Reads cache.db refs table (Apple only)
├── downloader/              # External content fetching
│   └── AppleApiDownloader.ts # Downloads missing content from Apple API
├── extractor/               # Content extraction from docsets
│   ├── ContentExtractor.ts  # Brotli decompression for Apple DocC
│   ├── TarixExtractor.ts    # Tarix archive extraction for Dash
│   └── UuidGenerator.ts     # SHA-1 UUID generation for cache lookup
├── formats/                 # Format abstraction layer
│   ├── types.ts             # DocsetFormat interface and types
│   ├── FormatRegistry.ts    # Format auto-detection
│   ├── AppleDocCFormat.ts   # Apple DocC format handler
│   ├── StandardDashFormat.ts # Generic Dash format handler
│   └── CoreDataFormat.ts    # CoreData format handler
├── generator/               # Output generation
│   └── MarkdownGenerator.ts # Converts parsed docs to markdown
├── parser/                  # Content parsing
│   ├── DocCParser.ts        # Parses Apple DocC JSON format
│   ├── HtmlParser.ts        # Parses HTML using cheerio/turndown
│   └── types.ts             # TypeScript interfaces for DocC schema
├── validator/               # Post-conversion validation
│   └── LinkValidator.ts     # Validates internal markdown links
└── writer/                  # File output
    ├── FileWriter.ts        # Writes files with statistics
    └── PathResolver.ts      # Resolves paths and sanitizes filenames
```

## Supported Docset Formats

### 1. Apple DocC Format

**Identification:** Has `cache.db` and `fs/` directory in `Contents/Resources/Documents/`

**Structure:**
```
docset.docset/
└── Contents/
    └── Resources/
        ├── docSet.dsidx          # SQLite with searchIndex table
        └── Documents/
            ├── cache.db          # UUID to content location mapping
            └── fs/               # Brotli-compressed DocC JSON files
                ├── 1
                ├── 2
                └── ...
```

**Content Flow:**
1. Query `searchIndex` for entries with request keys
2. Generate UUID from request key using SHA-1 algorithm
3. Look up content location (dataId, offset, length) in `cache.db`
4. Decompress `fs/{dataId}` with brotli
5. Extract JSON at specified offset
6. Parse DocC JSON structure

### 2. Standard Dash Format

**Identification:** Has `searchIndex` table but no `cache.db` or `ZTOKEN` table

**Structure:**
```
docset.docset/
└── Contents/
    └── Resources/
        ├── docSet.dsidx          # SQLite with searchIndex table
        ├── tarix.tgz             # Compressed HTML archive (optional)
        ├── tarixIndex.db         # Index for tarix archive (optional)
        └── Documents/            # HTML files (if no tarix)
            └── *.html
```

**Content Flow:**
1. Query `searchIndex` for entries
2. Extract HTML from `tarix.tgz` or `Documents/` folder
3. Parse HTML with cheerio
4. Convert to markdown with turndown

### 3. CoreData Format

**Identification:** Has `ZTOKEN` and `ZNODE` tables in `docSet.dsidx`

**Structure:**
```
docset.docset/
└── Contents/
    └── Resources/
        ├── docSet.dsidx          # SQLite with ZTOKEN, ZNODE, ZTOKENTYPE
        ├── tarix.tgz             # Compressed HTML archive
        └── tarixIndex.db         # Index for tarix archive
```

**Content Flow:**
1. Query `ZTOKEN` joined with `ZTOKENTYPE` for entries
2. Get file paths via `ZTOKENMETAINFORMATION` and `ZFILEPATH`
3. Extract HTML from `tarix.tgz`
4. Parse and convert to markdown

## Core Components

### FormatRegistry

The `FormatRegistry` manages format detection and instantiation:

```typescript
interface DocsetFormat {
  detect(docsetPath: string): Promise<boolean>;
  getName(): string;
  initialize(docsetPath: string): Promise<void>;
  getEntryCount(filters?: EntryFilters): number;
  iterateEntries(filters?: EntryFilters): Generator<NormalizedEntry>;
  extractContent(entry: NormalizedEntry): Promise<ParsedContent | null>;
  getTypes(): string[];
  getCategories(): string[];
  supportsMultipleLanguages(): boolean;
  getLanguages(): string[];
  close(): void;
}
```

Detection priority: Apple DocC → CoreData → Standard Dash

### ConverterRegistry

The `ConverterRegistry` maps format handlers to format-specific converters:

```typescript
interface DocsetConverter {
  getFormat(): DocsetFormat;
  getFormatName(): string;
  convert(options: ConverterOptions, onProgress?: ProgressCallback): Promise<ConversionResult>;
  getOutputPath(entry: NormalizedEntry, content: ParsedContent, outputDir: string): string;
  generateIndexes(outputDir: string, generator: MarkdownGenerator): void;
  close(): void;
}
```

**Converter Types:**

| Converter | Format | Output Structure |
|-----------|--------|------------------|
| `AppleConverter` | Apple DocC | `language/framework/item.md` |
| `StandardDashConverter` | Standard Dash | `type/item.md` |
| `CoreDataConverter` | CoreData | `type/item.md` (extends StandardDash) |

**BaseConverter** provides shared functionality:
- Main conversion loop with progress tracking
- Markdown generation via `MarkdownGenerator`
- File writing with directory creation
- Filename sanitization

Each converter implements format-specific:
- `getOutputPath()` - determines file location
- `generateIndexes()` - creates `_index.md` files
- `trackForIndex()` - tracks items for index generation

### AppleApiDownloader

Downloads missing content from Apple's public documentation API:

```typescript
class AppleApiDownloader {
  download(requestKey: string): DocCDocument | null;
  isCached(requestKey: string): boolean;
  getStats(): DownloadStats;
  clearCache(): void;
}
```

Used when `--download` flag is enabled and local content extraction fails.

### UUID Generation (Apple DocC)

Apple uses a specific algorithm to generate cache lookup keys:

```
Request Key: "ls/documentation/uikit/uiwindow"
                    │
                    ▼
        Extract canonical path
        "/documentation/uikit/uiwindow"
                    │
                    ▼
           SHA-1 hash (20 bytes)
                    │
                    ▼
        Truncate to 6 bytes
                    │
                    ▼
         Base64url encode
                    │
                    ▼
     Prepend language prefix
     "ls" (Swift) or "lc" (Obj-C)
                    │
                    ▼
        Final UUID: "lsXYZ123..."
```

### Content Extraction

**Apple DocC:**
```
1. Generate UUID from request key
2. Query cache.db: SELECT data_id, offset, length FROM refs WHERE uuid = ?
3. Read fs/{data_id} file
4. Decompress with brotli
5. Extract JSON substring at [offset, offset+length]
6. Parse as DocCDocument
```

**On-Demand Download (--download flag):**

Some Apple docsets use on-demand content downloading where the `fs/` directory is incomplete. When local extraction fails and `--download` is enabled:

```
1. Local extraction fails (missing fs file or cache entry)
2. Convert request key to API URL:
   "ls/documentation/photos/phvideorequestoptions"
   → "https://developer.apple.com/tutorials/data/documentation/photos/phvideorequestoptions.json"
3. Fetch JSON from Apple's public API
4. Cache in memory for session
5. Parse as DocCDocument
```

**Standard Dash / CoreData:**
```
1. Get file path from database
2. Look up in tarixIndex.db for archive location
3. Extract from tarix.tgz using tar-stream
4. Parse HTML with cheerio
5. Convert to markdown with turndown
```

### Markdown Generation

The `MarkdownGenerator` produces consistent markdown output:

```markdown
# Title

**Framework**: UIKit | **Type**: Class | **Platforms**: iOS 2.0+

> Hierarchy > Breadcrumb > Path

Brief description of the symbol.

## Declaration

\`\`\`swift
class UIWindow : UIView
\`\`\`

## Overview

Detailed documentation content...

## Topics

### Creating Windows
- [init(frame:)](./init.md): Creates a new window.

## Relationships

### Inherits From
- [UIView](../UIView.md)

## See Also
- [UIScreen](./UIScreen.md)
```

## Data Flow

### Conversion Pipeline

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   CLI Args   │───▶│   Format     │───▶│   Create     │───▶│   Run        │
│              │    │  Detection   │    │  Converter   │    │  Conversion  │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                   │
       ┌───────────────────────────────────────────────────────────┘
       ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Iterate    │───▶│   Extract    │───▶│   Generate   │───▶│    Write     │
│   Entries    │    │   Content    │    │   Markdown   │    │    Files     │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                   │
                                                                   ▼
                                                            ┌──────────────┐
                                                            │   Generate   │
                                                            │   Indexes    │
                                                            └──────────────┘
```

### Orchestration Flow

```typescript
// 1. CLI detects format
const format = await FormatRegistry.detectFormat(docsetPath);

// 2. Create appropriate converter
const converter = ConverterRegistry.createConverter(format, docsetName);

// 3. Run conversion (all logic delegated to converter)
const result = await converter.convert(options, onProgress);

// 4. Converter handles internally:
//    - Entry iteration via format.iterateEntries()
//    - Content extraction via format.extractContent()
//    - Markdown generation via MarkdownGenerator
//    - File writing with format-specific paths
//    - Index generation
```

### Entry Processing Loop (inside BaseConverter)

```typescript
for (const entry of format.iterateEntries(filters)) {
  // 1. Extract raw content (JSON or HTML)
  const content = await format.extractContent(entry);

  // 2. Content is already parsed by format handler
  //    - Apple: DocCParser.parse() called internally
  //    - Others: HtmlParser.parse() called internally

  // 3. Generate markdown from ParsedContent
  const markdown = this.generateMarkdown(content);

  // 4. Get format-specific output path
  //    - Apple: language/framework/item.md
  //    - Generic: type/item.md
  const outputPath = this.getOutputPath(entry, content, outputDir);

  // 5. Write file
  this.writeFile(outputPath, markdown);

  // 6. Track for index generation
  this.trackForIndex(entry, content, outputPath);
}

// 7. Generate index files after all entries processed
this.generateIndexes(outputDir);
```

## Output Structure

### Apple Docsets

```
output/
├── swift/
│   ├── _index.md              # List of frameworks
│   └── uikit/
│       ├── _index.md          # List of types
│       ├── uiwindow.md
│       └── uiwindow/
│           ├── rootviewcontroller.md
│           └── makekeyandvisible.md
└── objective-c/
    └── uikit/
        └── ...
```

### Generic Docsets

```
output/
├── _index.md                  # List of types with counts
├── function/
│   ├── _index.md
│   ├── array_map.md
│   └── json_encode.md
├── class/
│   ├── _index.md
│   └── datetime.md
└── constant/
    ├── _index.md
    └── php_version.md
```

## Link Validation

When the `--validate` flag is used, the `LinkValidator` performs post-conversion validation:

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    Find      │───▶│   Extract    │───▶│   Resolve    │
│  .md files   │    │    Links     │    │    Paths     │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
                                               ▼
                                        ┌──────────────┐
                                        │   Check if   │
                                        │ target exists│
                                        └──────────────┘
```

**Validation Process:**
1. Recursively find all `.md` files in output directory (iterative to avoid stack overflow)
2. Build a set of all existing file paths for fast lookup
3. Extract markdown links matching `[text](path.md)` pattern
4. Resolve each link relative to its source file
5. Check if resolved path exists in the file set
6. Report broken links and absolute links (which should be relative)

**Validation Results:**
- Total links found
- Valid links (target exists)
- Broken links (target missing) with source file and expected path
- Absolute links (should be converted to relative)

## Error Handling

- Missing content: Logged as failed, processing continues
- Invalid format: Exit with error message
- Database errors: Wrapped and re-thrown with context
- File write errors: Propagated to caller

## Performance Considerations

- **Lazy iteration**: Entries processed one at a time via generators
- **Caching**: Decompressed data cached in memory (ContentExtractor)
- **Batch preloading**: Data IDs can be preloaded for better I/O
- **Progress tracking**: Real-time progress with rate calculation
- **Index generation**: Deferred until all entries processed

## Dependencies

| Package | Purpose |
|---------|---------|
| `better-sqlite3` | SQLite database access |
| `commander` | CLI argument parsing |
| `cheerio` | HTML parsing |
| `turndown` | HTML to Markdown conversion |
| `tar-stream` | Tarix archive extraction |
| `brotli` (system) | Decompression via CLI |
