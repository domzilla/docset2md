# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2025-12-15

### Added
- Format-specific search binaries with built-in help documentation.
- New "Search Index" section in the README.

### Changed
- The CLI now reports the version from `package.json`.

### Fixed
- Fixed `termList` rendering and several formatting issues (parameter indentation, section order, external links) in DocC output.
- Framework content is now preserved in `_index.md` files.
- FTS5 query escaping prevents syntax conflicts on special characters.
- The search CLI now resolves its source paths correctly when invoked from `dist/`.

## [1.2.0] - 2025-12-14

### Added
- Searchable FTS5 index with a standalone `search` binary for querying converted documentation.
- Type links to declarations in DocC output.
- Internal link transformation for CoreData and Standard docsets.

## [1.1.1] - 2025-12-14

### Fixed
- Fixed broken links in DocC index generation and skipped external links during validation.
- Resolved visual alignment issues in generated output.

## [1.1.0] - 2025-12-13

### Added
- `--download` flag fetches missing content from Apple's API for incomplete docsets.
- Comprehensive link validation across all docset formats.
- Generic docset format handlers for multi-format support (Standard Dash, CoreData).
- Percentage progress indicator in CLI output.
- MIT license, README, and architecture documentation.

### Changed
- Restructured the source tree by format with unified naming conventions.
- CLI now supports multiple docset formats via a format abstraction layer.
- The `extract-framework` script accepts input/output parameters.

### Fixed
- Fixed broken links to nested types by using lowercase paths.
- Improved link resolution and table parsing for Apple DocC docsets.
- Fixed cross-framework link resolution and external HTML link rendering.
- Resolved a stack overflow in link validation on large docsets.
- Method parameter labels are preserved in filenames to prevent overwrites.
- Framework capitalization is now consistent across all components.

## [1.0.0] - 2025-12-11

### Added
- Initial release of the docset2md CLI.
- Apple DocC format support with Brotli decompression and JSON extraction.
- SQLite-based index reading with cache lookup for content locations.
- Markdown generation from the DocC JSON schema.
- Filtering by language, framework, and type, plus an entry limit for testing.
- Optional link validation pass over the generated markdown.
