# Issue: Missing Markdown Files After Conversion

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
