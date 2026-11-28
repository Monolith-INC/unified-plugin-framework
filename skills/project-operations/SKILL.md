---
name: project-operations
description: Perform a project work-item operation through its configured adapter, or resume it after missing project setup.
---

# Project Operations

Use the project's language for communication, documentation and other prose. Carry the user's original request through the operation. The project selects its adapter; the workflow does not choose a destination or call a provider's native tools.

Write the neutral request to a JSON file and run `node .upf-tools/bin/agent-plugin project request --input <file> --project <project-directory>`. The supported operations are:

Run the installed launcher from the project root. In a source checkout, the equivalent command is `pnpm --dir <framework-checkout> agent-plugin project ...` after its documented install/build. Use the known installation path. If neither runtime is available, preserve the request and tell the user to provide the framework CLI; project bootstrap cannot repair a missing executable. Do not download or install anything silently.

| Operation | Inputs |
| --- | --- |
| `get_work_item` | `ref` |
| `search_work_items` | `query`, optional `cursor` |
| `create_work_item` | `kind`, `title`, `description`, optional `parent` |
| `update_work_item` | `ref`, `changes` containing the fields to change: `title`, `description`, `parent` |
| `transition_work_item` | `ref`, `state` |
| `list_children` | `ref`, optional `cursor` |
| `list_artifacts` | `ref`, optional `cursor` |
| `publish_artifact` | `ref`, `artifact` containing `kind`, `title`, `content`, `revision` |

Kinds are `epic`, `feature`, `user_story`, `task`, `bug`; states are `backlog`, `ready`, `in_progress`, `done`, `canceled`. Use the project's team template when preparing an item's content. Submit only work the user has authorized. When a listing returns `hasMore`, request its next `cursor` before treating the listing as complete.

On `setup-needed`, run `project-bootstrap` with the returned setup context and this request file. Setup resumes the operation itself; do not execute it again after it succeeds. On completion, adopt the returned project language and report the result. Later operations use the adapter directly.

On failure, follow the returned recovery. An uncertain write must be located or read back before retrying. A connection problem does not mean the user's setup choices were lost. Keep unsupported work as a draft and explain the available next step.
