# Standard Docset Internal Links Not Converted [RESOLVED]

## Problem

When converting Standard/CoreData docsets (like PHP), internal links in the HTML content are preserved as `.html` references instead of being converted to the correct markdown paths.

**Example from `test_data/output/PHP/class/arrayobject.md`:**
```markdown
class **ArrayObject** implements [IteratorAggregate](class.iteratoraggregate.html), [ArrayAccess](class.arrayaccess.html)
```

The link `class.iteratoraggregate.html` should be `../interface/iteratoraggregate.md`.

## Root Cause

The HTML-to-Markdown conversion (via Turndown in `HtmlParser.ts`) preserves anchor href attributes exactly as they appear in the source HTML. No custom rule exists to transform internal `.html` links to their corresponding markdown output paths.

## Technical Analysis

### Link Patterns in PHP Docset

Internal HTML links use simple filenames (no path prefix):
- `class.iteratoraggregate.html` - class/interface link
- `arrayobject.append.html` - method link
- `function.var-dump.html` - function link
- `class.arrayobject.html#arrayobject.constants.std-prop-list` - link with anchor

External links use absolute URLs:
- `https://www.php.net/...` - should be preserved as-is

### Database Entry Paths

The searchIndex table stores full paths:
```
IteratorAggregate | Interface | www.php.net/manual/en/class.iteratoraggregate.html
ArrayObject       | cl        | www.php.net/manual/en/class.arrayobject.html
```

### Output Structure

StandardConverter outputs: `{type}/{sanitizedName}.md`
```
output/
├── interface/
│   └── iteratoraggregate.md
├── class/
│   └── arrayobject.md
└── function/
    └── var_dump.md
```

### Link Transformation Required

| Source HTML Link | Database Path | Entry | Output Path |
|-----------------|---------------|-------|-------------|
| `class.iteratoraggregate.html` | `www.php.net/manual/en/class.iteratoraggregate.html` | name=IteratorAggregate, type=Interface | `../interface/iteratoraggregate.md` |
| `arrayobject.append.html` | `www.php.net/manual/en/arrayobject.append.html` | name=ArrayObject::append, type=clm | `./arrayobject_append.md` |
| `function.var-dump.html` | `www.php.net/manual/en/function.var-dump.html` | name=var_dump, type=Function | `../function/var_dump.md` |

## Current Code Flow

1. `StandardFormat.iterateEntries()` → yields entries from searchIndex
2. `StandardFormat.extractContent()` → calls `HtmlParser.parse()`
3. `HtmlParser.extractDescription()` → calls `turndown.turndown(html)`
4. Turndown converts `<a href="file.html">` → `[text](file.html)` (unchanged)
5. `BaseConverter.generateMarkdown()` → writes markdown with broken links

## Proposed Solution

### Phase 1: Build Link Mapping

Before conversion starts, build a mapping from HTML filenames to output paths:

```typescript
interface LinkMapping {
  htmlFilename: string;      // "class.iteratoraggregate.html"
  outputPath: string;        // "interface/iteratoraggregate.md"
  type: string;              // "Interface"
  name: string;              // "IteratorAggregate"
}

// Map: htmlFilename → LinkMapping
const linkMap = new Map<string, LinkMapping>();
```

Build from searchIndex by extracting the filename from each entry's path:
```typescript
for (const entry of db.iterateAll()) {
  const htmlFilename = basename(entry.path.split('#')[0]);  // "class.iteratoraggregate.html"
  const outputPath = `${entry.type.toLowerCase()}/${sanitize(entry.name)}.md`;
  linkMap.set(htmlFilename, { htmlFilename, outputPath, type: entry.type, name: entry.name });
}
```

### Phase 2: Transform Links During HTML Conversion

Add a custom Turndown rule for anchor tags in `HtmlParser.ts`:

```typescript
// Pass linkMap to HtmlParser constructor or parse method
this.turndown.addRule('internalLinks', {
  filter: (node) => node.nodeName === 'A' && node.getAttribute('href'),
  replacement: (content, node) => {
    const href = node.getAttribute('href');

    // Skip external URLs
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return `[${content}](${href})`;
    }

    // Extract filename and anchor
    const [filename, anchor] = href.split('#');

    // Look up in mapping
    const mapping = this.linkMap.get(filename);
    if (mapping) {
      const mdPath = this.computeRelativePath(mapping.outputPath);
      const anchorSuffix = anchor ? `#${anchor}` : '';
      return `[${content}](${mdPath}${anchorSuffix})`;
    }

    // Fallback: keep original link
    return `[${content}](${href})`;
  }
});
```

### Phase 3: Compute Relative Paths

Since output files are in different directories, links need to be relative:
- From `class/arrayobject.md` to `interface/iteratoraggregate.md` → `../interface/iteratoraggregate.md`
- From `class/arrayobject.md` to `class/datetime.md` → `./datetime.md`

```typescript
computeRelativePath(currentOutputPath: string, targetOutputPath: string): string {
  // Example: current = "class/arrayobject.md", target = "interface/iteratoraggregate.md"
  // Returns: "../interface/iteratoraggregate.md"
}
```

## Files to Modify

1. **`src/shared/HtmlParser.ts`**
   - Accept link mapping in constructor or parse method
   - Add custom Turndown rule for anchor tags

2. **`src/standard/StandardFormat.ts`**
   - Add method to build link mapping from searchIndex

3. **`src/standard/StandardConverter.ts`**
   - Build link mapping before conversion
   - Pass mapping to HtmlParser

4. **`src/shared/converter/BaseConverter.ts`** (optional)
   - Add link mapping support if needed across formats

## Alternative Approaches

### A. Post-Processing (Simpler but slower)
After conversion, scan all markdown files and replace `.html` links using the mapping.
- Pro: Simpler implementation, no changes to Turndown
- Con: Extra file I/O pass, harder to compute relative paths

### B. Two-Pass Conversion
First pass: Build mapping and extract content without link transformation.
Second pass: Re-process files with correct links.
- Pro: Cleaner separation of concerns
- Con: Doubles processing time

### C. URL-Based Approach
Use absolute paths (`/type/name.md`) instead of relative paths.
- Pro: Simpler path computation
- Con: Less portable, doesn't work in all markdown renderers

## Recommended Approach

**Phase approach with Turndown rule** (described above):
1. Build link mapping upfront from database
2. Pass mapping to HtmlParser
3. Transform links during HTML-to-Markdown conversion
4. Handle relative path computation based on current file location

This approach:
- Minimal performance overhead (single pass)
- Clean integration with existing Turndown pipeline
- Handles anchors correctly
- Produces portable relative links

## Resolution

**Implemented on 2025-12-14**

Added link transformation during HTML-to-Markdown conversion:

1. `src/shared/formats/types.ts` - Added `LinkMapping` interface
2. `src/standard/StandardFormat.ts` - Added `buildLinkMapping()` and `setLinkMapping()` methods
3. `src/shared/HtmlParser.ts` - Added custom Turndown rule for anchor tags with `setLinkContext()` method
4. `src/standard/StandardConverter.ts` - Wired up link mapping before conversion

**Results:**
- Interface links: `class.iteratoraggregate.html` → `../interface/iteratoraggregate.md` ✓
- Type links: `language.types.integer.html` → `../guide/integers.md` ✓
- Method links: `arrayobject.append.html` → `../method/arrayobject_append.md` ✓
- Anchors preserved: `class.arrayobject.html#section` → `./arrayobject.md#section` ✓
- External links unchanged ✓

Navigation links to pages not in the searchIndex (like `index-2.html`, `funcref.html`) remain unchanged since they have no corresponding markdown output.
