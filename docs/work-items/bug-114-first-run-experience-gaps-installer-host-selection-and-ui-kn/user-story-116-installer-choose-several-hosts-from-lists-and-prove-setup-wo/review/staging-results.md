# AGE-130 staging verification

Tested commit `e92609bc9917447d99007520d4740d62c6f44b26` on Linux x64. The workspace suite ran in a clean Git clone with `umask 022` and type checking disabled. The package check used the archive built from that same clone.

| Check | Result |
| --- | --- |
| Frozen dependency install, build without type checking, all package test scripts | Passed |
| Generated payload verification for Codex, Claude Code and Cursor | Passed |
| Complete distribution | Passed two-host install, saved single-host plan, re-entry, artifact imports, installed skill discovery checks and staging of all five bundled dependencies with fetching denied |
| Fresh interactive installation | Python and Claude Code were absent from PATH. The launcher asked before installing private Python 3.12.16. The wizard selected Codex and Claude Code, obtained permission for the missing host CLI, and left the test repository untouched through final confirmation. The observed install recovered Claude Code 2.1.318. |
| Per-host verification | Both hosts passed skills, dependency and discovery checks. Shared setup passed settings, CLI, knowledge runtime, knowledge settings and local tracker checks. |
| Exit status and pending work | Exit `2` with headless discovery declined. The knowledge store and server checks still require project knowledge. Review bindings still require configuration. The installed CLI verified the two corresponding hand-offs. |
| Saved plan with `--strict` | Reused the recovered Claude Code executable, verified discovery for both hosts, and changed exit `2` to `1` while retaining the two verified pending tasks. |

The first trial exposed two defects. Consent for a missing host CLI was recorded without attempting recovery, and a stop discarded the detailed CLI report. The tested commit recovers a missing CLI from a pinned, checksum-verified native package in a private user directory and preserves the failure report and log path. The final trial used an isolated Git repository and host configuration. It exercised local setup without model calls or credentials.

The complete-distribution archive SHA-256 is `24d8b68da0390d68cc07d87d8e6e7939d4880131874691b0d5695003b5f74913`. Local staging logs are under `/tmp/upf-age130.EyEpCJ`. The full-suite log SHA-256 is `c2bafd230e44c48cde7c8c8586de7ec7413a9c8546bf4f0f23caff6f671117e4`, and the fresh-install transcript SHA-256 is `c656b2ff73fca435163139d5da958297f7521e919f18408b34a99e3efb611c44`.
