# docset2md

A Node.js TypeScript CLI tool that converts Apple Documentation docsets to Markdown files for AI agent consumption.

## Project Structure

```
src/
├── index.ts                    # CLI entry point (commander-based)
├── db/
│   ├── IndexReader.ts          # Reads docSet.dsidx SQLite database
│   └── CacheReader.ts          # Reads cache.db for content locations
├── extractor/
│   ├── UuidGenerator.ts        # SHA-1 based UUID generation for cache lookup
│   └── ContentExtractor.ts     # Brotli decompression and JSON extraction
├── parser/
│   ├── DocCParser.ts           # Parses DocC JSON into structured data
│   └── types.ts                # TypeScript interfaces for DocC schema
├── generator/
│   └── MarkdownGenerator.ts    # Converts parsed docs to markdown
└── writer/
    ├── FileWriter.ts           # Writes output files
    └── PathResolver.ts         # Resolves documentation paths to file paths
```

## How It Works

### Apple Docset Format

Apple docsets use a complex format:

1. **SQLite Index** (`Contents/Resources/docSet.dsidx`): Contains `searchIndex` table with entries (name, type, path)
2. **Cache Database** (`Contents/Resources/Documents/cache.db`): Maps UUIDs to content locations (data_id, offset, length)
3. **Compressed Content** (`Contents/Resources/Documents/fs/`): Brotli-compressed files containing DocC JSON

### UUID Generation Algorithm

```typescript
// Request key: "ls/documentation/uikit/uiwindow"
// 1. Extract canonical path: "/documentation/uikit/uiwindow"
// 2. SHA-1 hash, truncate to 6 bytes, base64url encode
// 3. Prepend language prefix: "ls" (Swift) or "lc" (Obj-C)
// Result: "lsXYZ123..."
```

### Content Extraction Flow

1. Query `searchIndex` for entries
2. Parse request_key from path URL
3. Generate UUID from request_key
4. Look up (data_id, offset, length) in cache.db
5. Decompress fs/{data_id} with brotli
6. Extract JSON at offset:offset+length
7. Parse DocC JSON and generate markdown

## Commands

```bash
# Convert full docset (both Swift and Objective-C)
npm run dev -- <docset-path> -o <output-dir>

# Convert specific language
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

```
output/
├── Swift/
│   ├── _index.md
│   └── UIKit/
│       ├── _index.md
│       ├── UIWindow.md
│       └── uiwindow/
│           ├── rootViewController.md
│           └── becomeKeyWindow.md
└── Objective-C/
    └── UIKit/
        └── ...
```

## Key Implementation Details

### Link Resolution

Links in DocC JSON use URL paths like `/documentation/uikit/uiwindow/rootviewcontroller`. These are converted to relative markdown links like `./uiwindow/rootViewController.md` based on:
- URL path structure determines subdirectory
- Reference title determines filename (sanitized)

### Filename Sanitization

- Invalid characters (`<>:"/\|?*`) replaced with `_`
- Method signatures truncated at `(`
- Colons become underscores, trailing underscores stripped
- Max length 100 characters

### Entry Types

The docset contains 21 entry types: Framework, Class, Struct, Protocol, Enum, Method, Property, Function, Constant, Type, Variable, Constructor, Operator, Macro, Guide, Sample, Section, Category, Union, Namespace, Script

## Dependencies

- `better-sqlite3`: SQLite database access
- `commander`: CLI argument parsing
- `brotli` (system): Decompression via CLI tool

## Build & Run

```bash
npm install
npm run build
npm run dev -- <docset-path> -o <output-dir>
```

## Test Data

Full docset: `test_data/input/Apple_API_Reference.docset/`
- 678,322 entries
- 306 frameworks
- ~1.8GB markdown output

Smaller test docset: `test_data/input/Apple_UIKit_Reference.docset/`
- 25,254 entries (UIKit only)
- 73MB size
- Use for faster testing

### Extracting Framework-Specific Docsets

Use `scripts/extract-framework-apple-docset.ts` to create smaller test docsets:

```bash
# Single framework
npx tsx scripts/extract-framework-apple-docset.ts UIKit

# Multiple frameworks
npx tsx scripts/extract-framework-apple-docset.ts Foundation CoreData
```
