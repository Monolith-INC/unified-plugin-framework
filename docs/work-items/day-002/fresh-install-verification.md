# AGE-216 Fresh-install verification

Built the reviewed workflow code at `f69aab2afee866a0526adb95902fcb6bf391e6ad` with the desktop verification from `40bb13af62aaccbd80bd4b8a774638e229ce9fdf`. The distribution contains six pinned dependencies. The installer verified the archive checksum before extraction. A separate `sha256sum -c SHA256SUMS` check verified the archive and both installer files.

| Requirement | Observed result |
| --- | --- |
| [FR-001](adr.md#fr-001) | The archive installer successfully configured the CLI and Codex skills in an empty temporary project. With PATH restricted to `/usr/bin:/bin`, no global `agent-plugin` was available. Node ran the project launcher and `question next` returned a ready Discovery state. The installed skill names the same launcher. |
| [FR-005](adr.md#fr-005) | The launcher identified the project skill as the installed version and matched its release bytes. It classified a separate fixture for cached 0.5.1 as a different source, still identified the expected installed version, and reported the fixture's version as unknown when its manifest was absent. |
| [FR-007](adr.md#fr-007) | The installed README's 21 relative link occurrences resolved to 20 distinct destinations, including three checked heading fragments. The distribution also contains all 32 paths reached by the release documentation check from README and CHANGELOG. |

The repository's artifact integration check passed for Codex and Claude Code. It exercised both host payloads, staging all six pinned dependencies, installer re-entry, relocation, and refusal of modified dependency files.

Artifact `unified-plugin-framework-0.6.0-day002.f69aab2.tar.gz`

```
4fb5b725a619fdb8ed0bd0866571ebd6b21c343a8179e810b9f139f74c441baa
```
