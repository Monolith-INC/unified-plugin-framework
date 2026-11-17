---
name: project-bootstrap
description: Complete missing project setup, preserve existing choices and resume the original project operation.
---

# Project Bootstrap

Use the setup context returned by the project operation. If setup was requested explicitly without that context, run `agent-plugin project describe --project <project-directory>` once. If configured, use its project language and continue the user's request. Do not add a recurring setup check.

Use the CLI supplied with the installation. In a source checkout, `pnpm --dir <framework-checkout> agent-plugin project ...` is the same command after install/build. If the CLI is unavailable, preserve the request and identify that installation prerequisite instead of restarting setup or silently installing a replacement.

The returned choices describe the available adapters and the settings each needs. Reuse existing valid choices. Ask only for missing choices: the tracker and its required project values, the language for communication/documentation/prose, and the planning document location. Offer a brief recommended default where appropriate. Resolve existing project values from connected sources when available instead of asking the user to repeat them. The user chooses the tracker; do not infer it from an example.

Collect the missing questions together. Preserve the original operation while waiting. Use the existing project knowledge setup when its knowledge/document locations need configuring; keep its authoritative settings in place rather than copying them into a second configuration. Do not install plugins, change providers or save credentials as a side effect of setup.

After the user accepts the choices, write the answers as JSON in a temporary file, following the returned settings shape. Run `agent-plugin project setup --input <answers-file> --resume <original-request-file> --project <project-directory>`. Omit `--resume` when there was no pending operation. The project preserves unrelated settings, saves the choices, constructs the adapter and resumes the pending operation once.

Use the returned language for subsequent prose. On a credential or connection failure, follow the specific recovery and keep the saved choices. Do not restart the interview or repeat a write whose outcome is unknown.
