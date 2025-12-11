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
│                         Content Extraction                              │
│              (extractor/ContentExtractor, TarixExtractor)               │
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
```

## Directory Structure

```
src/
├── index.ts                 # CLI entry point and orchestration
├── db/                      # Database readers for SQLite indexes
│   ├── IndexReader.ts       # Reads docSet.dsidx searchIndex table
│   └── CacheReader.ts       # Reads cache.db refs table (Apple only)
├── extractor/               # Content extraction from docsets
│   ├── ContentExtractor.ts  # Brotli decompression for Apple DocC
│   ├── TarixExtractor.ts    # Tarix archive extraction for Dash
│   └── UuidGenerator.ts     # SHA-1 UUID generation for cache lookup
├── parser/                  # Content parsing
│   ├── DocCParser.ts        # Parses Apple DocC JSON format
│   ├── HtmlParser.ts        # Parses HTML using cheerio/turndown
│   └── types.ts             # TypeScript interfaces for DocC schema
├── generator/               # Output generation
│   └── MarkdownGenerator.ts # Converts parsed docs to markdown
├── writer/                  # File output
│   ├── FileWriter.ts        # Writes files with statistics
│   └── PathResolver.ts      # Resolves paths and sanitizes filenames
└── formats/                 # Format abstraction layer
    ├── types.ts             # DocsetFormat interface and types
    ├── FormatRegistry.ts    # Format auto-detection
    ├── AppleDocCFormat.ts   # Apple DocC format handler
    ├── StandardDashFormat.ts # Generic Dash format handler
    └── CoreDataFormat.ts    # CoreData format handler
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
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   CLI Args   │───▶│   Format     │───▶│  Initialize  │
│              │    │  Detection   │    │   Format     │
└──────────────┘    └──────────────┘    └──────────────┘
                                               │
                                               ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    Write     │◀───│   Generate   │◀───│   Extract    │
│   Markdown   │    │   Markdown   │    │   Content    │
└──────────────┘    └──────────────┘    └──────────────┘
       │
       ▼
┌──────────────┐
│   Generate   │
│   Indexes    │
└──────────────┘
```

### Entry Processing Loop

```typescript
for (const entry of format.iterateEntries(filters)) {
  // 1. Extract raw content (JSON or HTML)
  const content = await format.extractContent(entry);

  // 2. Content is already parsed by format handler
  //    - Apple: DocCParser.parse() called internally
  //    - Others: HtmlParser.parse() called internally

  // 3. Generate markdown from ParsedContent
  const markdown = generateMarkdown(content, generator);

  // 4. Write to appropriate path
  //    - Apple: Language/Framework/Item.md
  //    - Generic: Type/Item.md
  writeEntry(outputDir, entry, content, markdown);

  // 5. Track for index generation
  trackForIndex(entry, content, filePath);
}

// 6. Generate index files after all entries processed
generateIndexes(outputDir, trackedItems, generator);
```

## Output Structure

### Apple Docsets

```
output/
├── Swift/
│   ├── _index.md              # List of frameworks
│   └── UIKit/
│       ├── _index.md          # List of types
│       ├── UIWindow.md
│       └── uiwindow/
│           ├── rootViewController.md
│           └── makeKeyAndVisible.md
└── Objective-C/
    └── UIKit/
        └── ...
```

### Generic Docsets

```
output/
├── _index.md                  # List of types with counts
├── Function/
│   ├── _index.md
│   ├── array_map.md
│   └── json_encode.md
├── Class/
│   ├── _index.md
│   └── DateTime.md
└── Constant/
    ├── _index.md
    └── PHP_VERSION.md
```

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
