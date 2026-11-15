# Code review workflow

Review work against its requirements and the project's recorded decisions, at three points in the lifecycle. The design follows [ADR-001](../adr/ADR-001-workflow-adapter-interface.md).

## Contract v1

What users and agents rely on. It changes only by a deliberate contract version bump.

| Operation | Framework skill | When |
| --- | --- | --- |
| `review-task` | `plugins/unified-plugin-framework/skills/review-task` | A small unit of work is complete, before committing or handing off |
| `review-story` | `plugins/unified-plugin-framework/skills/review-story` | A user story is finished: pre-flight before the pull request, post-flight once it is open |
| `review-feature` | `plugins/unified-plugin-framework/skills/review-feature` | A whole feature is complete |

The contract type is `CodeReviewOperation` in `packages/workflows/src/code-review.ts`.

## Current adapter

`reviewToolkitAdapter` fulfils the contract with the [Monolithic Code Review Toolkit](https://github.com/Monolith-INC/monolithic-code-review-toolkit), declared in the framework manifest as `^0.6.0`:

| Operation | Toolkit skills |
| --- | --- |
| `review-task` | `review-task` |
| `review-story` | `review-story-preflight`, `review-story-postflight` |
| `review-feature` | `review-feature` |

## Readiness

A review runs only when every step passes, checked in this order:

1. **Declared:** the framework manifest declares each plugin the adapter uses, for `code-review`.
2. **Installed:** the plugin is installed and has skills.
3. **Bound:** the plugin provides every skill the adapter maps, and the project has one knowledge store. `.project-knowledge.json` sets `knowledgeRoot`, and the review toolkit's `.monolithic-code-review/sources.json` sets `knowledge.root` to the same directory. The toolkit reads only its own setting, so a missing or different one fails this step.

The framework skills also confirm the plugin's skills are available in the session, which covers a plugin that is installed but not enabled.

From a checkout, check readiness with:

```sh
pnpm --filter @agent-plugins/cli exec agent-plugin adapter-check code-review \
  --framework plugins/unified-plugin-framework \
  --plugin-root <installed-toolkit>/plugins/monolithic-code-review-toolkit \
  --project <project>
```

It prints `{"ok":true,...}` and exits `0` when ready. Otherwise it prints the failing step and reason and exits `1`. Invalid arguments, an unknown workflow, or configuration it cannot read (a missing or broken manifest, a folder that is not a plugin, invalid JSON) print the problem and exit `2`. `--framework` is required; `--help` prints the usage.

## Replacing the review plugin

Write a new `CodeReviewAdapter` that maps each operation to the new plugin's skills and records where that plugin keeps its knowledge store, if anywhere. Declare the plugin in the framework manifest, update the plugin names in the three framework skills, and run `adapter-check` against it. Tests fail if the skills and the adapter disagree. The contract and the skill names users invoke stay the same.
