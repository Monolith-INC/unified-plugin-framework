# Code review workflow

Review work against its requirements and the project's recorded decisions, at three points in the lifecycle. The design follows [ADR-001](../adr/ADR-001-workflow-adapter-interface.md).

## Contract v1

What users and agents rely on. It changes only by a deliberate contract version bump.

| Operation | Framework skill | When |
| --- | --- | --- |
| `review-task` | `skills/review-task` | A small unit of work is complete, before committing or handing off |
| `review-story` | `skills/review-story` | A user story is finished: pre-flight before the pull request, post-flight once it is open |
| `review-feature` | `skills/review-feature` | A whole feature is complete |

The skills in `plugins/unified-plugin-framework` are templates: they hold the contract and name no plugin. The contract type is `CodeReviewOperation` in `packages/workflows/src/code-review.ts`. When the plugin is packaged, the assembler fills each template from the adapter below; the assembled skills ship in the host bundles.

## Current adapter

`reviewToolkitAdapter` fulfils the contract with the [Monolithic Code Review Toolkit](https://github.com/Monolith-INC/monolithic-code-review-toolkit), declared in the framework manifest as `^0.6.0`:

| Operation | Toolkit skills |
| --- | --- |
| `review-task` | `review-task` |
| `review-story` | `review-story-preflight`, `review-story-postflight` |
| `review-feature` | `review-feature` |

## Readiness and recovery

Each step is checked in order. A failing step never just stops the review: it carries a recovery action, which the skill takes before continuing.

| Step | Fails when | Recovery |
| --- | --- | --- |
| Declared | The framework manifest does not declare the plugin for `code-review` | Ask the user to reinstall the framework; this is a packaging problem |
| Installed | The plugin is missing, or not enabled in the session | Ask the user, in one line, to install and enable it for this host; continue once it is |
| Bound: skills | The installed version lacks a mapped skill | Ask the user to install a version that provides it |
| Bound: project store | `.project-knowledge.json` has no `knowledgeRoot` | Run `setup-project-knowledge` with its defaults, then continue |
| Bound: shared store | `.monolithic-code-review/sources.json` does not set `knowledge.root` to the project store (the toolkit reads only its own setting) | Run `monolithic-code-review-toolkit:review-setup`, point it at the project store, then continue |

Problems no recovery action can fix go to the repair agent ([AGE-94](https://linear.app/agentical-monolithics/issue/AGE-94/repair-agent-for-severe-workflow-failures)).

From a checkout, check readiness with:

```sh
pnpm --filter @agent-plugins/cli exec agent-plugin adapter-check code-review \
  --framework plugins/unified-plugin-framework \
  --plugin-root <installed-toolkit>/plugins/monolithic-code-review-toolkit \
  --project <project>
```

It prints `{"ok":true,...}` and exits `0` when ready. Otherwise it prints the failing step, the reason and the recovery action, and exits `1`. Invalid arguments, an unknown workflow, or configuration it cannot read (a missing or broken manifest, a folder that is not a plugin, invalid JSON) print the problem and exit `2`. `--framework` is required; `--help` prints the usage.

## Replacing the review plugin

Write a new `CodeReviewAdapter` that maps each operation to the new plugin's skills and records where that plugin keeps its knowledge store, if anywhere, with the skill that sets it. Declare the plugin in the framework manifest, run `pnpm payloads:build` to rebuild the host bundles, and run `adapter-check` against it. The templates, the contract and the skill names users invoke stay the same.
