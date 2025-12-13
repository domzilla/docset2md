# Issue: Missing Markdown Files After Conversion

**Status: Partially Resolved**

## Problem

When running `validate-links.ts` on `Apple_API_Reference.docset`, there is a significant discrepancy between generated and found files:

```
Generated 674,735 markdown files
Found 446,637 markdown files
```

**Missing files: 228,098 (34% of written files)**

## Root Cause Analysis

The discrepancy is caused by **multiple entries mapping to the same output file path**, resulting in overwrites. This is not a bug but expected behavior given the database structure.

### Database Structure

| Metric | Count |
|--------|-------|
| Total entries in searchIndex | 678,322 |
| Unique request keys (raw) | 497,348 |
| Unique request keys after sanitization | 449,260 |
| Entries that failed extraction | 3,587 |
| Successful writes | 674,735 |
| Actual files on disk | 446,637 |
| **Overwrites** | **228,098** |

### Causes of Overwrites

#### 1. Duplicate Entries with Different Metadata (180,926 duplicates)

The same `request_key` appears in multiple entries with different `dash_entry_language` or `dash_entry_name` values:

```
# Same content URL, different language tags:
request_key=ls/documentation/accelerate/1399056-vimage-buffer-type-codes#<dash_entry_language=occ>
request_key=ls/documentation/accelerate/1399056-vimage-buffer-type-codes#<dash_entry_language=swift>

# Same content URL, different symbol names:
request_key=lc/documentation/uikit/uiviewconfigurationstate-c.class/selected  → name: "selected"
request_key=lc/documentation/uikit/uiviewconfigurationstate-c.class/selected  → name: "isSelected"
```

All these entries produce the same markdown content (same documentation page), so overwriting is correct behavior.

#### 2. Filename Sanitization Collisions (48,088 collisions)

Method overloads with different signatures get sanitized to the same filename:

```
# Different method signatures become the same file:
ls/documentation/uikit/init(frame:)  → init.md
ls/documentation/uikit/init(coder:)  → init.md
ls/documentation/uikit/init(_:)      → init.md
```

This is caused by `sanitizeFileName()` truncating at `(` to avoid invalid filesystem characters.

### Calculation

| Step | Count | Notes |
|------|-------|-------|
| Unique raw request keys | 497,348 | |
| After parenthesis truncation | 449,260 | -48,088 due to method overload collisions |
| After extraction failures | ~445,673 | -3,587 failed extractions |
| Actual files on disk | 446,637 | Close match (within margin) |

The `filesWritten` counter increments on every `writeFileSync()` call, even when overwriting an existing file. This is why we see 674,735 "generated" but only 446,637 files on disk.

## Impact

1. **Data Loss**: When multiple method overloads exist, only the last one processed is kept. For example, if `init(frame:)` and `init(coder:)` map to `init.md`, one gets overwritten.

2. **Misleading Statistics**: The "generated" count doesn't reflect unique files.

## Potential Solutions

### Option A: Disambiguate Method Overloads (Recommended)

Change filename generation to preserve method signature uniqueness:

```typescript
// Instead of truncating at (
function sanitizeFileName(name: string): string {
  // Convert init(frame:) → init_frame
  // Convert init(coder:) → init_coder
  // Convert perform(_:with:afterDelay:) → perform_with_afterdelay
}
```

**Pros**: Preserves all documentation, no data loss
**Cons**: Longer filenames, requires updating link generation to match

### Option B: Skip Duplicate Writes

Track written file paths and skip if already exists:

```typescript
const writtenPaths = new Set<string>();
if (!writtenPaths.has(filePath)) {
  writeFileSync(filePath, markdown);
  writtenPaths.add(filePath);
  filesWritten++;
}
```

**Pros**: Accurate file count, faster (no redundant writes)
**Cons**: Still loses method overload documentation

### Option C: Merge/Append Documentation

For colliding paths, append content instead of overwriting:

```typescript
if (existsSync(filePath)) {
  const existing = readFileSync(filePath, 'utf-8');
  const merged = mergeDocumentation(existing, markdown);
  writeFileSync(filePath, merged);
}
```

**Pros**: Preserves all documentation
**Cons**: Complex merging logic, potentially messy output

### Option D: Accept as Expected Behavior

Document this as intentional - multiple index entries can point to the same documentation page, and overwriting is correct because the content is identical.

**Pros**: No code changes needed
**Cons**: Doesn't solve method overload data loss

## Recommendation

Implement **Option A** (disambiguate method overloads) to preserve all documentation, combined with **Option B** (skip duplicate writes) for accurate counting and performance.

The method overload collision issue is the real data loss problem - 48,088 potential unique pages are being collapsed. The duplicate entry issue (same content URL, different metadata) is expected and not data loss.

## Resolution

### Implemented: Option A (2025-12-13)

Updated `sanitizeFileName` in all components to preserve method parameter labels:

```typescript
// Before: init(frame:) → init.md, init(coder:) → init.md (collision!)
// After:  init(frame:) → init_frame.md, init(coder:) → init_coder.md
```

**Files modified:**
- `src/shared/PathResolver.ts`
- `src/index.ts`
- `scripts/validate-links.ts`
- `src/docc/DocCParser.ts`
- `tests/unit/writer/PathResolver.test.ts`

**Commit:** `f36939f` - Preserve method parameter labels in filenames to prevent overwrites

### Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Files found | 446,637 | 493,620 | +46,983 (+10.5%) |
| Broken links | ~27,567 | 29,577 | +2,010 |

The increase in broken links is expected - more files means more files containing external references to documentation not included in the docset.

### Remaining Issues

The remaining ~181,000 overwrites are from duplicate entries (same content URL, different language/metadata tags). These are **not data loss** - they represent the same documentation page indexed multiple times for different contexts.

Option B (skip duplicate writes) could still be implemented for:
- More accurate file count reporting
- Slight performance improvement (avoid redundant writes)

---

## New Issue: Malformed External HTML Links (2025-12-13)

### Problem

~349 broken links are caused by malformed external HTML references. Example:

```
[About Bundle IDs](../../Ides/Conceptual/AppDistributionGuide/ConfiguringYourApp/ConfiguringYourApp.html#//apple_ref/doc/uid/tp40012582-ch28-sw8.md)
```

### Root Cause

DocC references contain URLs to external HTML documentation like:
```
/documentation/Ides/Conceptual/AppDistributionGuide/ConfiguringYourApp/ConfiguringYourApp.html#//apple_ref/doc/uid/tp40012582-ch28-sw8
```

The `buildRelativePathFromUrl` function in `DocCParser.ts`:
1. Matches the `/documentation/` pattern (treating "Ides" as a framework name)
2. Processes the `.html#//apple_ref/...` fragment as path segments
3. Appends `.md` to the final segment, creating invalid paths

### Impact

- 349 occurrences across 287 files
- Links point to non-existent files with `.html#...` in the path
- External Apple documentation (guides, tech notes) cannot be resolved

### Proposed Fix

Detect external HTML links in `buildRelativePathFromUrl` and handle them appropriately:

```typescript
private buildRelativePathFromUrl(url: string, title: string): string {
  // Detect external HTML links - don't convert to markdown paths
  if (url.includes('.html')) {
    // Option A: Return plain title (no link)
    return null;  // Signal to caller to render as plain text

    // Option B: Keep as external link (won't resolve locally)
    // return url;
  }

  // ... existing documentation path handling
}
```

### Affected Reference Types

These appear to be links to:
- Apple Developer Documentation guides (`/documentation/Ides/Conceptual/...`)
- Technical Notes and articles
- Legacy HTML documentation not converted to DocC format

### Resolution (2025-12-13)

Implemented detection of external HTML links in `buildRelativePathFromUrl`. URLs containing `.html` now return `null`, causing them to render as plain text instead of malformed markdown links.

**Commit:** `c7b628d` - Render external HTML links as plain text in DocC parser

---

## Link Validation: Skip Broken Links During Conversion (2025-12-13)

### Problem

Links in the source docset may reference documentation that doesn't exist in the docset. For example:

```
Swift/Xpc/xpcarray/subscript_as_-9ukjj.md:
  -> [nil](../../Objectivec/nil.md)
     Missing: Swift/Objectivec/nil.md
```

These links are already broken in the source docset - the target documentation simply isn't included.

### Solution

Added link validation during conversion that checks if the target documentation path exists in the docset's language availability map before generating links. If the target doesn't exist, the reference is rendered as plain text instead of a broken link.

**Validation checks added:**

1. **External Apple URLs without `/documentation/`**: URLs like `https://developer.apple.com/shareplay` that don't point to documentation paths are rendered as plain text

2. **Non-documentation URLs**: When language lookup is available, URLs that don't match the `/documentation/` pattern are rendered as plain text

3. **Missing documentation paths**: URLs matching `/documentation/framework/path` are validated against the language availability map; if the path doesn't exist, rendered as plain text

### Implementation

Modified `buildRelativePathFromUrl` in `src/docc/DocCParser.ts`:

```typescript
// External Apple URLs without /documentation/ path
if (url.includes('developer.apple.com') && !url.includes('/documentation/')) {
  return null;
}

// Check if target exists in docset before generating link
if (this.languageLookup) {
  const availableLangs = this.languageLookup(targetDocPath);
  if (!availableLangs) {
    // Target doesn't exist in docset - render as plain text
    return null;
  }
}
```

### Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Broken links | 22,229 | 8,740 | -60% |

### Remaining Broken Links

The remaining ~8,740 broken links are references to valid documentation paths that exist in the searchIndex but whose files weren't generated due to content extraction failures. This is a separate issue - the documentation exists in the docset but couldn't be extracted.

These are NOT broken links in the source docset; they're valid references to documentation that failed to extract for other reasons (missing content, extraction errors, etc.).

---

## Table Parsing Fix (2025-12-13)

### Problem

Some documents with tables failed to parse, causing content extraction failures:

```
Parse ERROR: Cannot read properties of undefined (reading 'map')
    at DocCParser.renderTable
```

### Root Cause

The DocC JSON schema has two different table formats:

1. **Object format**: `rows: [{ cells: [{ content: [...] }] }]`
2. **Array format**: `rows: [[[...], [...]], [[...], [...]]]` (rows as arrays of cell arrays)

The parser only handled the object format, failing when encountering the array format.

### Solution

Updated `renderTable` in `DocCParser.ts` to handle both formats:

```typescript
if (Array.isArray(row)) {
  // Array format - row is directly an array of cells
  cells = row;
} else if (row.cells) {
  // Object format - extract content from each cell
  cells = row.cells.map(cell => cell.content);
}
```

### Results

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Broken links | 8,740 | 882 | -90% |

### Remaining Broken Links

The remaining ~882 broken links are references to valid documentation paths that exist in the searchIndex but whose content is not available in the local fs/ files. This is because Apple docsets use on-demand downloading - some content files are fetched from Apple's servers when accessed in Dash.

Example: `PHVideoRequestOptions` class exists in the index but its content file (`fs/150`) is not present in the docset.

---

## Missing fs Files - On-Demand Download Support (2025-12-13)

### Problem

Some Apple docsets use on-demand content downloading. The docset includes:
- Complete searchIndex with all entries
- Complete cache.db with UUID → (data_id, offset, length) mappings
- **Incomplete** fs/ directory - some files are downloaded on-demand by Dash

Investigation revealed:
- 31 fs files missing (data IDs 150-179 and 355)
- 947 cache entries reference these missing files
- ~882 broken links result from this missing content

### Root Cause

Apple includes a helper binary (`Contents/Resources/Documents/bin/Apple Docs Helper`) that downloads missing content from `https://docs-assets.developer.apple.com/published/`. When Dash accesses documentation, the helper fetches any missing content.

### Solution: On-Demand Download via Apple API (2025-12-13)

Implemented direct downloading from Apple's public documentation API:

```typescript
// API URL pattern:
// Request key: ls/documentation/photos/phvideorequestoptions
// API URL: https://developer.apple.com/tutorials/data/documentation/photos/phvideorequestoptions.json
```

**Usage:**
```bash
# Enable downloading with --download flag
docset2md ./Apple_API_Reference.docset -o ./output --download
```

**Implementation details:**
- Added `enableDownload` option to `ContentExtractor`
- When local extraction fails and download is enabled, fetches from Apple's API
- Downloaded content is cached in memory for the conversion session
- Falls back gracefully if download fails (network issues, content not available)

**Files modified:**
- `src/docc/ContentExtractor.ts` - Added download functionality
- `src/shared/formats/types.ts` - Added `FormatInitOptions` interface
- `src/docc/DocCFormat.ts` - Pass options to extractor
- `src/FormatDetector.ts` - Pass options through detection
- `src/index.ts` - Added `--download` CLI flag

### Verification

```
Testing WITHOUT download:
  PHVideoRequestOptions: NOT FOUND

Testing WITH download:
  PHVideoRequestOptions: FOUND
  Title: PHVideoRequestOptions
  Framework: Photos
  Downloads: 1
```

### Notes

- Downloads require internet access
- Apple's API is public and doesn't require authentication
- Download mode is opt-in to avoid unexpected network requests
- Each missing entry adds ~100-500ms for download (network latency)
