# Skill evaluation cases

Review these cases against the standalone setup and discovery procedures. These are walkthrough prompts, not executed model conversations.

1. **Empty project:** Setup proposes `.project-knowledge/knowledge`, `docs/`, and `Codex/`; asks to accept defaults; discovery waits for accepted configuration.
2. **Existing review root:** Setup proposes the configured existing root for the shared store and preserves existing document locations where present.
3. **Conflicting roots:** Setup explains the runtime conflict and offers the legacy root as the supported persistent choice. A different choice requires user-directed legacy reconciliation and a recheck; it never merges or silently changes legacy settings.
4. **User accepts defaults:** Setup records the accepted paths, mode, and schema while preserving unrelated configuration keys.
5. **Human-authored rule becomes stale:** Discovery identifies affected source paths and asks the user to review; it does not silently rewrite stated content.
6. **Unsupported platform:** Before runtime import/use, report Linux/macOS support only and explain that Windows is unsupported in this release.
7. **Shared originals:** Setup proposes one shared `docsRoot`/`vaultRoot` (existing matching root or `docs/`); `knowledgeRoot` remains a separate optimized representation location.
8. **Separate originals:** Setup proposes distinct `docs/` and `Codex/` locations, unless existing locations or `documentMode` provide defaults.
