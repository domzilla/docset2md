# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2025-12-15

### Added
- Format-specific search binaries with comprehensive help documentation
- ESLint and Prettier with style guide configuration
- Lint and format checks to build script
- Search Index section to README

### Changed
- CLI version now reads from package.json
- Applied code style guide across entire codebase
- Refactored search CLI to reduce code duplication

### Fixed
- termList rendering in DocC parser
- Framework content preservation in _index.md files
- FTS5 query escaping to prevent syntax conflicts
- DocC conversion: parameter indentation, section order, external links
- Search CLI source path resolution from dist/

## [1.2.0] - 2025-12-14

### Added
- Searchable FTS5 index with standalone search binary for querying converted documentation
- Type links to declarations in DocC output
- Internal link transformation for CoreData and Standard docsets

### Removed
- Resolved issue files from issues/ directory

## [1.1.1] - 2025-12-14

### Changed
- Moved FormatDetector and ConverterFactory to src/factory/
- Updated documentation to reflect new naming and structure
- Updated @module paths in file headers to match new directory structure
- Updated JSDoc comments to reflect new class names
- Updated ARCHITECTURE.md to reflect current file structure
- Updated README.md with correct output structure and CLI options

### Fixed
- Broken links in DocC index generation
- Skip external links during link validation
- Visual alignment issues

### Removed
- issues/ directory (all issues resolved)

## [1.1.0] - 2025-12-13

### Added
- `--download` flag to fetch missing content from Apple's API
- Comprehensive link validation for all docset formats
- Multi-format integration tests and link validation tests
- Comprehensive unit tests for Apple DocC implementation with Jest framework
- Generic docset format handlers for multi-format support
- HTML parsing utilities for generic docsets
- Format abstraction layer enabling support for multiple docset formats
- Percentage progress indicator to CLI output
- JSDoc documentation to all source files
- File headers with @module, @fileoverview, author, and creation date
- Architecture documentation (ARCHITECTURE.md)
- Comprehensive README for GitHub
- MIT license
- Dependencies for testing and HTML parsing

### Changed
- Restructured src/ directory by format with unified naming conventions
- Renamed FormatRegistry to FormatDetector and ConverterRegistry to ConverterFactory
- Moved FormatDetector and ConverterFactory to src/ root
- Refactored conversion into dedicated converter modules
- Extracted shared utilities and consolidated duplicate code
- Moved link validation to separate module and integrated into CLI
- Updated CLI to support multiple docset formats
- Updated integration tests to use dynamic docset discovery
- Made extract-framework script accept input/output parameters

### Fixed
- Broken links for nested types by using lowercase paths throughout
- Link resolution for Apple DocC docsets
- Table parsing for array-format DocC tables
- Cross-framework link resolution in Apple DocC parser
- Stack overflow in link validation for large docsets
- Path resolution for Dash metadata tags and empty docset handling
- Content quality test for web documentation docsets
- Method parameter label preservation in filenames to prevent overwrites
- Framework capitalization alignment across all components
- External HTML links now render as plain text in DocC parser

## [1.0.0] - 2025-12-11

### Added
- Initial release of docset2md CLI tool
- Apple DocC format support with Brotli decompression and JSON extraction
- SQLite-based index reading for docSet.dsidx database
- Cache.db lookup for content locations
- SHA-1 based UUID generation for cache lookup
- Markdown generation from DocC JSON schema
- Language and framework filtering options
- Type filtering support
- Entry limit option for testing
- Link validation integration
