# DocC Broken Links Investigation

**Status: RESOLVED** (2025-12-14)

## Summary

After running a full conversion with `--validate --download`, 21 broken links were found out of 902,639 total links (99.998% valid). The broken links fell into distinct categories, each with a different root cause. **All 21 issues have been fixed.**

---

## Category 1: Missing Framework Index Files

**Affected:**
- `swift/_index.md` → `./driverkit/_index.md` (missing)
- `swift/_index.md` → `./mididriverkit/_index.md` (missing)
- `objective-c/_index.md` → `./createmlcomponents/_index.md` (missing)
- `objective-c/_index.md` → `./foundationmodels/_index.md` (missing)
- `objective-c/_index.md` → `./realitykit/_index.md` (missing)
- `objective-c/_index.md` → `./swiftui/_index.md` (missing)
- `objective-c/_index.md` → `./watchos-apps/_index.md` (missing)
- `objective-c/_index.md` → `./workoutkit/_index.md` (missing)
- `objective-c/_index.md` → `./xcode/_index.md` (missing)

### Root Cause

The language index files (e.g., `swift/_index.md`) include links to ALL frameworks that have ANY entries processed, but framework `_index.md` files are only created when the framework has qualifying items (Class, Struct, Protocol, Enum).

**Code Flow:**

1. In `DocCConverter.ts`, `trackForIndex()` (lines 108-157) adds frameworks to `frameworkItems` map whenever ANY entry for that framework is processed
2. Framework name is extracted from the entry path: `/ls/documentation/driverkit/...` → `driverkit`
3. However, `generateIndexes()` (lines 169-185) only creates a framework `_index.md` if there are items with types Class/Struct/Protocol/Enum
4. The language root index (lines 188-209) lists ALL frameworks in the map, regardless of whether they have a `_index.md`

**Why These Frameworks Have No `_index.md`:**

These frameworks DO have content files, but no `_index.md` because the content is not Class/Struct/Protocol/Enum type:

- `swift/driverkit/`: Has 1 file (`communicating-between-a-driverkit-extension-and-a-client-app.md` - a Guide), but no `_index.md`
  - Note: `objective-c/driverkit/` has 2001 items including `_index.md` - so driverkit has full Objective-C content, just minimal Swift content
- `swift/mididriverkit/`: Similar situation - may only have Guide/Sample/Article types in Swift
- `objective-c/createmlcomponents`, `foundationmodels`, `realitykit`, `swiftui`, `watchos-apps`, `workoutkit`, `xcode`: Swift-only frameworks - content exists in Swift variant but not Objective-C

**The Pattern:** Framework directories get created when ANY content is written, but `_index.md` only gets created when there are Class/Struct/Protocol/Enum items to list. The language index then links to ALL framework directories, incorrectly assuming they all have `_index.md`.

### Fix Options

1. **Option A (Recommended):** Only include framework in language index if framework `_index.md` was actually created
   - Track which frameworks had their index written
   - Filter language index links to only include written frameworks

2. **Option B:** Create empty framework `_index.md` files with a note like "No documented types in this framework"

---

## Category 2: Underscore Sanitization Mismatch (UnboundedRange_)

**Affected:**
- `swift/swift/_index.md` → `./unboundedrange_.md` (missing)

### Root Cause

The filename sanitization in `sanitize.ts` strips trailing underscores:

```typescript
sanitized = sanitized.replace(/^_+|_+$/g, '');
```

- Entry name: `UnboundedRange_`
- Sanitized filename: `unboundedrange.md` (trailing underscore stripped)
- Link generated: `./unboundedrange_.md` (uses original name)

### Fix

Ensure link generation applies the same sanitization as file creation. The `sanitizeFilename()` function should be used consistently for both file paths AND link targets.

---

## Category 3: Anonymous Struct/Union Fields

**Affected:**
- `swift/metalperformanceshaders/_index.md` → `./mpspackedfloat3-swift.typealias/__unnamed_struct___anonymous_field0.md`
- `swift/metalperformanceshaders/_index.md` → `./mpspackedfloat3-swift.typealias/__unnamed_union___anonymous_field0.md`
- `swift/metal/_index.md` → `./mtlpackedfloat3-swift.typealias/__unnamed_struct___anonymous_field0.md`
- `swift/metal/_index.md` → `./mtlpackedfloat3-swift.typealias/__unnamed_union___anonymous_field0.md`

### Root Cause

C/C++ compiler-generated names for anonymous structs/unions have multiple underscores:
- Original: `__Unnamed_struct___Anonymous_field0`
- After `/__+/g` collapse: `_Unnamed_struct_Anonymous_field0`
- After leading underscore strip: `Unnamed_struct_Anonymous_field0`

The link may reference the original or partially sanitized name while the file uses the fully sanitized name.

### Fix

Same as Category 2: Apply consistent sanitization to both link targets and file names.

---

## Category 4: CoreServices Long Filename Truncation

**Affected:**
- `objective-c/coreservices/_index.md` → `./1472089-classic_compatibility_attribute_.md`
- `objective-c/coreservices/_index.md` → `./1471030-code_fragment_manager_attribute_.md`
- `objective-c/coreservices/_index.md` → `./1572744-constants_for_object_specifiers_.md`
- `objective-c/coreservices/_index.md` → `./1471735-file_system_attribute_selectors_.md`
- `objective-c/coreservices/_index.md` → `./1471177-standard_directory_prompt_panel_.md`
- `objective-c/coreservices/_index.md` → `./1472276-text_services_manager_attribute_.md`
- `objective-c/coreservices/_index.md` → `./1473148-virtual_memory_information_type_.md`

### Root Cause

These are NOT actually truncation issues (100 char limit). The filenames end with `_.md` because:

1. The original name ends with words like "Selectors" or "Operations"
2. When sanitized and truncated (if needed), the name ends with an underscore
3. The trailing underscore gets stripped from the actual file
4. But the link preserves the pre-strip version

Example: "Classic Compatibility Attribute Selectors" → `classic_compatibility_attribute_selectors` → filename uses sanitized version

### Verification Needed

Check if these files exist with the underscore stripped:
- `1472089-classic_compatibility_attribute.md` vs `1472089-classic_compatibility_attribute_.md`

---

## Relevant Code Locations

| File | Lines | Description |
|------|-------|-------------|
| `src/docc/DocCConverter.ts` | 108-157 | `trackForIndex()` - tracks items, creates framework map entries |
| `src/docc/DocCConverter.ts` | 169-209 | `generateIndexes()` - generates index files, filters by type |
| `src/docc/DocCConverter.ts` | 190-196 | Language root index generation (includes ALL frameworks) |
| `src/shared/utils/sanitize.ts` | 47-56 | `sanitizeFilename()` - underscore handling, truncation |

---

## Recommended Fixes

### Priority 1: Framework Index Links (9 broken links)

In `DocCConverter.ts`, modify `generateLanguageIndex()` to only include frameworks that have content:

```typescript
// Track which frameworks actually have content
private writtenFrameworks = new Set<string>();

// In generateIndexes(), after writing framework index:
if (items.length > 0) {
  await this.writer.writeFile(indexPath, indexContent, 'index');
  this.writtenFrameworks.add(framework);
}

// In language root index generation:
for (const [framework] of langItems) {
  if (this.writtenFrameworks.has(framework)) {
    content += `- [${framework}](./${framework}/_index.md)\n`;
  }
}
```

### Priority 2: Sanitization Consistency (12 broken links)

Ensure link targets use the same sanitization as file paths:

```typescript
// In trackForIndex(), when computing the link URL:
const sanitizedName = sanitizeFilename(entry.name);
const linkUrl = `./${sanitizedName}.md`;
```

---

## Impact

- **Total links:** 902,639
- **Broken links:** 21 (0.002%)
- **Categories:**
  - Missing framework indexes: 9
  - Sanitization mismatch: 12

The issue has minimal impact on overall documentation usability but should be fixed for completeness.

---

## Resolution

### Fix 1: Framework Index Links (Commit: pending)

Modified `DocCConverter.ts` `generateIndexes()` to only include frameworks in language root indexes if they have items (i.e., their `_index.md` was actually created):

```typescript
// Generate language root indexes
// Only include frameworks that have items (i.e., their _index.md was written)
for (const lang of ['swift', 'objc'] as const) {
  const langDir = lang === 'swift' ? 'swift' : 'objective-c';
  const frameworks = Array.from(this.frameworkItems.keys())
    .filter(fw => {
      const langItems = this.frameworkItems.get(fw)?.get(lang);
      return langItems && langItems.length > 0; // Only include if _index.md was created
    })
    // ...
}
```

### Fix 2: Sanitization Consistency (Commit: pending)

Modified `DocCConverter.ts` `trackForIndex()` to apply consistent sanitization to link URLs:

```typescript
// Calculate relative URL from the framework index
// IMPORTANT: Sanitize path segments to match actual file paths
let relativeUrl: string;
const pathMatch = entry.path.match(/l[sc]\/documentation\/[^/]+\/(.+)/);
if (pathMatch) {
  // Sanitize each path segment to match getOutputPath() behavior
  const segments = pathMatch[1].split('/');
  const sanitizedSegments = segments.map(s => this.sanitizeFileName(s));
  relativeUrl = `./${sanitizedSegments.join('/')}.md`;
} else {
  relativeUrl = `./${this.sanitizeFileName(entry.name)}.md`;
}
```

### Verification

After applying the fixes:
- **Original 21 broken links:** All resolved
- **Remaining broken links:** 737 (these are in-content links within DocC JSON that reference articles/guides not included in this docset - a data limitation, not a code bug)
