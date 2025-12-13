# docset2md

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)

Convert .docsets bundles to Markdown files optimized for AI agent consumption.

## Overview

docset2md is a CLI tool that extracts and converts documentation .docsets bundles into clean, well-structured Markdown files. This makes documentation easily consumable by AI coding assistants and searchable.

## Features

- **Multi-Format Support**: Handles Apple DocC, Standard Dash, and CoreData docset formats
- **Automatic Format Detection**: Intelligently identifies the docset format
- **Language Separation**: Organizes Swift and Objective-C documentation separately (Apple docsets)
- **Hierarchical Output**: Preserves documentation structure with proper nesting
- **Index Generation**: Creates navigable index files for each section
- **Cross-Reference Links**: Converts internal documentation links to relative Markdown links
- **Flexible Filtering**: Filter by type, framework, or language

## Supported Formats

| Format | Index Database | Content Storage | Content Format |
|--------|----------------|-----------------|----------------|
| **Apple DocC** | searchIndex + cache.db | fs/ (brotli compressed) | DocC JSON |
| **Standard Dash** | searchIndex | tarix.tgz or Documents/ | HTML |
| **CoreData** | ZTOKEN + ZNODE tables | tarix.tgz | HTML |

## Installation

### Prerequisites

- Node.js 18 or higher
- npm or yarn

### From Source

```bash
git clone https://github.com/yourusername/docset2md.git
cd docset2md
npm install
npm run build
```

## Usage

### Basic Conversion

```bash
# Convert entire docset
npx docset2md <docset-path> -o <output-dir>

# Example
npx docset2md ~/docsets/Example.docset -o ./output/Example
```

### Language Filtering (Apple Docsets)

```bash
# Swift only
npx docset2md <docset-path> -o <output-dir> -l swift

# Objective-C only
npx docset2md <docset-path> -o <output-dir> -l objc
```

### Framework Filtering

```bash
# Single framework
npx docset2md <docset-path> -o <output-dir> -f UIKit

# Multiple frameworks
npx docset2md <docset-path> -o <output-dir> -f UIKit Foundation CoreData
```

### Type Filtering

```bash
# Only classes and protocols
npx docset2md <docset-path> -o <output-dir> -t Class Protocol

# Only functions
npx docset2md <docset-path> -o <output-dir> -t Function
```

### Limit Entries (Testing)

```bash
# Convert first 100 entries only
npx docset2md <docset-path> -o <output-dir> --limit 100
```

### Information Commands

```bash
# Show docset information
npx docset2md info <docset-path>

# List available entry types
npx docset2md list-types <docset-path>

# List frameworks (Apple docsets)
npx docset2md list-frameworks <docset-path>
```

## Output Structure

### Apple Docsets

```
output/
├── swift/
│   ├── _index.md              # List of frameworks
│   └── uikit/
│       ├── _index.md          # List of types in UIKit
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
    └── php_version.md
```

## CLI Options

| Option | Description |
|--------|-------------|
| `-o, --output <dir>` | Output directory (required) |
| `-l, --language <lang>` | Filter by language: `swift` or `objc` |
| `-f, --framework <names...>` | Filter by framework names |
| `-t, --type <types...>` | Filter by entry types |
| `--limit <n>` | Limit number of entries to convert |
| `--download` | Download missing content from Apple API (Apple docsets) |
| `--validate` | Validate internal links after conversion |
| `-v, --verbose` | Enable verbose output |
| `-h, --help` | Show help |
| `-V, --version` | Show version |

## Entry Types

The tool recognizes these documentation entry types:

- **Code Elements**: Class, Struct, Protocol, Enum, Union, Namespace
- **Members**: Method, Property, Function, Constructor, Operator
- **Values**: Constant, Variable, Macro, Type
- **Documentation**: Framework, Guide, Sample, Section, Category, Script

## Development

### Building

```bash
npm run build
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Development Mode

```bash
npm run dev -- <docset-path> -o <output-dir>
```

### Project Structure

See [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) for detailed architecture documentation.

## Obtaining Docsets

Docsets can be obtained from:

- **Dash** (macOS): https://kapeli.com/dash
- **Zeal** (Windows/Linux): https://zealdocs.org/
- **Velocity** (Windows): https://velocity.silverlakesoftware.com/

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
