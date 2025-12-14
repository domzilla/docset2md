# Type Links Missing in Declaration Code Blocks

**Status: RESOLVED**

## Summary

When viewing Apple documentation in Dash, type names in declarations (like `String` in `var identifier: String? { get }`) are clickable links to their respective documentation. However, the converted markdown output renders these as plain text without links.

## Investigation Findings

### DocC JSON Structure

The raw DocC JSON **does contain type link information**. Looking at the entry for `identifier`:

```json
{
  "declarations": [
    {
      "tokens": [
        { "text": "var", "kind": "keyword" },
        { "text": " ", "kind": "text" },
        { "text": "identifier", "kind": "identifier" },
        { "text": ": ", "kind": "text" },
        {
          "identifier": "doc://com.externally.resolved.symbol/s:SS",
          "preciseIdentifier": "s:SS",
          "text": "String",
          "kind": "typeIdentifier"
        },
        { "text": "? { ", "kind": "text" },
        { "text": "get", "kind": "keyword" },
        { "text": " }", "kind": "text" }
      ],
      "languages": ["swift"]
    }
  ]
}
```

The `typeIdentifier` token includes:
- `identifier`: Reference key to look up in the `references` section
- `preciseIdentifier`: Swift mangled name
- `text`: Display text ("String")
- `kind`: Token type ("typeIdentifier")

The references section contains the URL mapping:

```
doc://com.externally.resolved.symbol/s:SS -> {
  title: "String",
  url: "/documentation/swift/string",
  type: "topic"
}
```

### Current Implementation

The `renderDeclarationTokens` method in `src/docc/DocCParser.ts:208-210` simply concatenates token text:

```typescript
private renderDeclarationTokens(decl: Declaration): string {
  return decl.tokens.map(t => t.text).join('');
}
```

This ignores the `identifier` field on `typeIdentifier` tokens.

### Output Format Consideration

Declarations are rendered in fenced code blocks:

```markdown
## Declaration

\`\`\`swift
var identifier: String? { get }
\`\`\`
```

Standard markdown does not support links inside fenced code blocks. Options:

1. **Keep as code block, no links** - Current behavior (loses type navigation)
2. **Inline code with links** - Use inline code: `` var identifier: [`String`](./swift/string.md)? { get } ``
3. **Mixed rendering** - Keywords as code, types as links: `var` `identifier`: [String](path) `{ get }`
4. **HTML in markdown** - Use `<code>` and `<a>` tags for full control

## Affected Files

- `src/docc/DocCParser.ts` - `renderDeclarationTokens()` method
- `src/docc/types.ts` - `DeclarationToken` interface (already has `identifier` field)

## Token Kinds with Potential Links

Based on DocC schema:
- `typeIdentifier` - Type references (String, Int, UIView, etc.)
- `internalParam` - Parameter types (may also have links)
- `externalParam` - External parameter types

## Related

The `references` section also maps:
- `doc://com.externally.resolved.symbol/c:objc(cs)NSString` → `/documentation/foundation/nsstring`

This enables cross-framework type links (e.g., Foundation types from UIKit docs).

## Recommendation

Implement option 2 (inline code with links) for the best balance of readability and functionality:

```markdown
## Declaration

`var` `identifier`: [`String`](../../swift/string.md)`?` `{` `get` `}`
```

Or use a custom renderer that preserves code styling while enabling links:

```markdown
## Declaration

<code>var identifier: <a href="../../swift/string.md">String</a>? { get }</code>
```

## Resolution

Implemented plain markdown rendering for declarations (no code blocks).

### Changes Made

1. **`src/docc/DocCParser.ts`**:
   - `renderDeclaration()` now passes `references` to token renderer
   - `renderDeclarationTokens()` checks each token for `identifier` field
   - Tokens with type references are rendered as markdown links

2. **`src/shared/MarkdownGenerator.ts`**:
   - Removed fenced code block wrapper from declarations
   - Declarations are now plain markdown text

### Result

Before:
```markdown
## Declaration

```swift
var identifier: String? { get }
```⁣
```

After:
```markdown
## Declaration

var identifier: [String](../../swift/string.md)? { get }
```

Type names like `String`, `Bool`, `Sequence` are now clickable links to their documentation.
