# docset2md

A Node.js TypeScript CLI tool that converts documentation docsets to Markdown files for AI agent consumption.

## Project Structure

```
src/
├── index.ts                    # CLI entry point (commander-based)
├── db/
│   ├── IndexReader.ts          # Reads docSet.dsidx SQLite database
│   └── CacheReader.ts          # Reads cache.db for content locations
├── extractor/
│   ├── UuidGenerator.ts        # SHA-1 based UUID generation for cache lookup
│   ├── ContentExtractor.ts     # Brotli decompression and JSON extraction
│   └── TarixExtractor.ts       # Tarix archive extraction for Dash docsets
├── parser/
│   ├── DocCParser.ts           # Parses DocC JSON into structured data
│   ├── HtmlParser.ts           # Parses HTML using cheerio/turndown
│   └── types.ts                # TypeScript interfaces for DocC schema
├── generator/
│   └── MarkdownGenerator.ts    # Converts parsed docs to markdown
├── writer/
│   ├── FileWriter.ts           # Writes output files
│   └── PathResolver.ts         # Resolves documentation paths to file paths
└── formats/                    # Format abstraction layer
    ├── types.ts                # DocsetFormat interface and types
    ├── FormatRegistry.ts       # Format auto-detection
    ├── AppleDocCFormat.ts      # Apple DocC format handler
    ├── StandardDashFormat.ts   # Generic Dash format handler
    └── CoreDataFormat.ts       # CoreData format handler
```

## Supported Formats

| Format | Detection | Content Storage | Content Format |
|--------|-----------|-----------------|----------------|
| **Apple DocC** | cache.db + fs/ | Brotli-compressed JSON | DocC JSON |
| **Standard Dash** | searchIndex only | tarix.tgz or Documents/ | HTML |
| **CoreData** | ZTOKEN + ZNODE tables | tarix.tgz | HTML |

## How It Works

### Format Detection

The `FormatRegistry` automatically detects the docset format:
1. **Apple DocC**: Has `cache.db` and `fs/` directory
2. **CoreData**: Has `ZTOKEN` table in SQLite
3. **Standard Dash**: Has `searchIndex` table (fallback)

### Apple DocC Content Extraction

1. Query `searchIndex` for entries
2. Generate UUID from request_key (SHA-1 hash, truncate to 6 bytes, base64url)
3. Look up (data_id, offset, length) in cache.db
4. Decompress fs/{data_id} with brotli
5. Extract JSON at offset:offset+length
6. Parse DocC JSON and generate markdown

### Standard Dash / CoreData Content Extraction

1. Query entries from searchIndex or ZTOKEN tables
2. Extract HTML from tarix.tgz archive or Documents/ folder
3. Parse HTML with cheerio
4. Convert to markdown with turndown

## Commands

```bash
# Convert full docset
npm run dev -- <docset-path> -o <output-dir>

# Convert specific language (Apple docsets)
npm run dev -- <docset-path> -o <output-dir> -l swift

# Filter by framework or type
npm run dev -- <docset-path> -o <output-dir> -f UIKit Foundation -t Class Protocol

# Limit entries (for testing)
npm run dev -- <docset-path> -o <output-dir> --limit 100

# Show docset info
npm run dev -- info <docset-path>

# List available types/frameworks
npm run dev -- list-types <docset-path>
npm run dev -- list-frameworks <docset-path>
```

## Output Structure

### Apple Docsets

```
output/
├── Swift/
│   ├── _index.md
│   └── UIKit/
│       ├── _index.md
│       ├── UIWindow.md
│       └── uiwindow/
│           └── rootViewController.md
└── Objective-C/
    └── UIKit/
        └── ...
```

### Generic Docsets

```
output/
├── _index.md
├── Function/
│   ├── _index.md
│   └── array_map.md
├── Class/
│   └── DateTime.md
└── Constant/
    └── PHP_VERSION.md
```

## Key Implementation Details

### Link Resolution

Links in DocC JSON use URL paths like `/documentation/uikit/uiwindow/rootviewcontroller`. These are converted to relative markdown links like `./uiwindow/rootViewController.md`.

### Filename Sanitization

- Invalid characters (`<>:"/\|?*`) replaced with `_`
- Method signatures truncated at `(`
- Colons become underscores, trailing underscores stripped
- Max length 100 characters

### Entry Types

Common types: Framework, Class, Struct, Protocol, Enum, Method, Property, Function, Constant, Type, Variable, Constructor, Operator, Macro, Guide, Sample, Section, Category, Union, Namespace, Script

## Dependencies

- `better-sqlite3`: SQLite database access
- `commander`: CLI argument parsing
- `cheerio`: HTML parsing
- `turndown`: HTML to Markdown conversion
- `tar-stream`: Tarix archive extraction

## Build & Run

```bash
npm install
npm run build
npm run dev -- <docset-path> -o <output-dir>
```

## Testing

```bash
npm test                 # Run all tests
npm run test:coverage    # Run with coverage
npm run test:watch       # Watch mode
```

## Test Data

Place `.docset` bundles in `test_data/input/` for integration testing. The test suite automatically discovers all docsets in this directory and runs format detection and content extraction tests against them.

### Extracting Framework-Specific Apple Docsets

Use `scripts/extract-framework-apple-docset.ts` to create smaller test docsets:

```bash
npx tsx scripts/extract-framework-apple-docset.ts -i <source.docset> -o test_data/input UIKit
```

## Code Style

### File Headers

Every newly generated TypeScript file must include a file header in the following format:

```typescript
/**
 * @file filename.ts
 * @module path/to/module
 * @author Dominic Rodemer
 * @created YYYY-MM-DD
 * @license MIT
 *
 * @fileoverview Short description of the file's purpose.
 */
```

- `@file`: The filename
- `@module`: The module path (e.g., `db/CacheReader`, `tests/unit/parser/DocCParser`)
- `@author`: Dominic Rodemer
- `@created`: The file creation date in ISO format
- `@license`: MIT
- `@fileoverview`: A concise one-line description of what the file does
