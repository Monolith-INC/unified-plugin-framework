# Architecture comparison: Codex project configuration

Proposed decision for AGE-155; it has not yet been incorporated into the approach.

## Options

1. **Keep the prototype's regular expressions.** Small change, but matching is not aware of TOML strings, tables, quoted keys or dotted keys. This cannot reliably protect existing settings.
2. **Parse and reserialize the entire document.** Establishes the semantic value, but a serializer may rewrite comments, ordering, formatting and TOML values. That conflicts with preserving user configuration unless a lossless editor is proven.
3. **Parse, apply a constrained edit, and verify.** Read a safe snapshot; parse it with a standards-compliant TOML parser; preserve any explicit value; propose a minimal edit only for a supported syntax shape; parse the result and verify that the intended key was added without changing other values. Preserve original bytes apart from the insertion, and refuse shapes the editor cannot safely handle. Use the existing protected compare-before-replace boundary.

## Recommendation

Choose option 3. Keep the semantic decision and edit planning separate from filesystem effects. Identify the existing safe read/write capabilities before implementation, and test comment preservation, line endings, unsafe paths and concurrent changes. A standards-compliant parser is necessary but does not itself make the textual edit safe.

The opt-in remains an explicit accepted setup choice. Trust and live host behavior are verified separately. Locate an existing continuation boundary for needs-input rather than adding another state store.

The user directed the workflow to keep this recommendation.
