# Standalone Project Knowledge Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an independently installable project knowledge plugin that reuses the review toolkit's existing storage and seven tools against one explicitly selected project store.

**Architecture:** Vendor the original knowledge implementation unchanged at a pinned revision, then add a small owned launcher and standalone skill around it. Keep configuration resolution pure and filesystem/process operations at the boundary. This is the first independently testable subsystem; session capture, knowledge incorporation, archival, and host automation are separate follow-on work.

**Tech Stack:** Python >=3.12; inherited `mcp>=2.0,<3` and `pydantic>=2.7,<3`; setuptools >=77; unittest. Existing TypeScript workspace checks remain intact. No new functional library is needed: use frozen records, tuples, explicit results, and pattern matching for new planning code.

**Spec:** [Working design](unified-plugin-framework-draft-plan.md), especially independent knowledge ownership, shared storage, and setup defaults. [Remaining subsystem scope](2026-11-14-knowledge-follow-on-scope.md).

## Global Constraints

- Work belongs to the existing Unified Plugin Framework project, P-AGE-6. Plans and specifications belong under `docs/work-items/`.
- “Keep original dependency source files unchanged.” Vendored files must match the source revision byte for byte; owned wrappers live outside that tree.
- “Keep pure planning separate from filesystem, network and process effects.” No filesystem reads in configuration selection.
- Each target project has one shared project knowledge store; never create a separate store per consumer.
- Setup offers a recommended default for every question and uses existing settings as proposed defaults.
- Preserve the distinction between user decisions, observed facts, agent proposals, and unresolved questions.
- Retain the inherited tool names, version-token checks, provenance, and retrieval order.
- No source-repository edits, tracker publication, automatic host registration, existing-store migration, session deletion, or package publication in this slice.
- Initial runtime qualification is Linux/macOS because inherited `knowledge_store.py` imports `fcntl`. Windows receives a clear unsupported-platform response before importing it; extending support is separate work. This is a proposed first-release limit, not a change to existing toolkit host support.
- Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm payloads:verify` at the release gate.

## Review Focus

- An inherited review configuration points at a different store: refuse ambiguous selection rather than silently splitting knowledge (Task 2).
- A wheel omits vendored modules or imports unrelated modules with the same names: test installation and startup outside the checkout (Tasks 1 and 3).
- Two writers use the same old version: one succeeds and the other reports conflict without overwriting the winner (Task 3).
- A configured root is absent or unreadable: report the condition without silently creating another store (Tasks 2 and 3).
- A caller runs on Windows: return an explicit limitation before the Unix-only module is imported (Task 3).

---

## Source baseline and decisions made for this plan

Inspected source: `Monolith-INC/monolithic-code-review-toolkit` at commit `3af148b44421521bb453be0abea05750e45f6f8a`.

- `adapters/knowledge/knowledge_store.py`: `KnowledgeStore(root, today=...)`; catalog/find/fetch/links and put/patch/add; filesystem effects and Unix locking already exist here.
- `adapters/knowledge/mcrt_knowledge_mcp.py`: seven decorated tools, `set_store(value)`, and `main(argv=None)`. Passing one root argument to `main` selects the store.
- `adapters/knowledge/pyproject.toml`: Python floor and dependencies above.
- `plugins/monolithic-code-review-toolkit/skills/discover-project-knowledge/SKILL.md`: discovery and incremental refresh procedure, currently tied to review configuration.
- `adapters/knowledge/tests/test_knowledge_store.py` and `test_knowledge_mcp.py`: existing regression coverage to retain.

Owned package name: `upf-project-knowledge`; console entry point: `upf-project-knowledge`; Python module: `upf_knowledge`. These are implementation proposals to review, not previously selected user names.

Keep this Python runtime in `runtimes/project-knowledge/`, outside the TypeScript-only `packages/*` build filter. Keep the standalone skill in `plugins/project-knowledge/skills/`. Do not alter compiler adapters to pretend they already package Python runtimes.

## File responsibilities

All paths below are relative to the Unified Plugin Framework repository.

| Path | Responsibility |
| --- | --- |
| `runtimes/project-knowledge/vendor/review-knowledge/` | Immutable source files, original tests, discovery skill, license, provenance |
| `runtimes/project-knowledge/pyproject.toml` | Owned distribution, entry point, dependency constraints and packaged vendor data |
| `runtimes/project-knowledge/src/upf_knowledge/__init__.py` | Package identity only |
| `runtimes/project-knowledge/src/upf_knowledge/config.py` | Pure root selection and explicit failure records |
| `runtimes/project-knowledge/src/upf_knowledge/launcher.py` | Arguments, platform checks, configuration reads, isolated vendor import and startup |
| `runtimes/project-knowledge/tests/` | Owned tests plus unchanged imported regression tests |
| `plugins/project-knowledge/plugin.json` | Portable source manifest using existing loader conventions |
| `plugins/project-knowledge/skills/discover-project-knowledge/SKILL.md` | Independently invokable procedure, owned adaptation with attribution |
| `plugins/project-knowledge/skills/setup-project-knowledge/SKILL.md` | Setup defaults and explicit shared-root choice |
| `docs/knowledge/README.md` | Installation, read/write contract, compatibility, limitations |
| `.github/workflows/ci.yml` | Add Python qualification alongside existing checks |

## Task 1: Reproducible, independently installable source extraction

**Files:** Create the vendor tree, `runtimes/project-knowledge/pyproject.toml`, `src/upf_knowledge/__init__.py`, `tests/test_vendor.py`, `tests/__init__.py`, and `docs/knowledge/README.md`.

**Interfaces:** Consumes the pinned source paths above. Produces an installable `upf-project-knowledge` distribution containing immutable vendor data under `upf_knowledge/_vendor/` in the built wheel; no new storage implementation.

- [ ] **Step 1: Write `test_vendor.py` with `test_pinned_bytes`, `test_required_license`, and `test_wheel_contains_runtime`.** Store full SHA-256 digests in `vendor/review-knowledge/provenance.json`: `repository`, `commit`, `files` mapping relative paths to digests. Assert each listed file matches, the commit equals the exact pin above, and the wheel contains both runtime modules and the original license. Obtain expected digests from a checkout of that exact upstream revision, not from files after adaptation.
- [ ] **Step 2: Run `python3.12 -m unittest discover -s runtimes/project-knowledge/tests -p test_vendor.py -v`.** Expect failure because the vendor files and package do not exist.
- [ ] **Step 3: Copy the two runtime modules, upstream `pyproject.toml`, README, root LICENSE, original discovery skill, and the two named regression test modules from the pinned revision without edits.** Package vendor files as data through setuptools configuration; the owned distribution uses the inherited dependency ranges. Add source attribution and the platform limitation to the documentation. Do not run the upstream installer.
- [ ] **Step 4: Build with `python3.12 -m pip wheel --no-deps runtimes/project-knowledge -w /tmp/upf-knowledge-wheels` and rerun Step 2.** Expect a wheel and all assertions passing. Record actual resolved dependency versions when testing; do not claim the inherited ranges guarantee future compatibility.
- [ ] **Step 5: Commit only this task's files:** `git add runtimes/project-knowledge docs/knowledge/README.md` then `git commit -m "feat: package pinned project knowledge source"`.

## Task 2: One explicit project store, with recoverable configuration errors

**Files:** Create `src/upf_knowledge/config.py`, `tests/test_config.py`; extend `docs/knowledge/README.md`.

**Interfaces:** Produce frozen `ConfigInput(project: str, explicit_root: str | None, configured_root: str | None, review_root: str | None)`, `StoreSelection(root: str, origin: Literal['explicit','project','review'])`, and `ConfigError(code: Literal['missing_root','conflicting_roots'], message: str)`. Produce `select_store(value: ConfigInput) -> StoreSelection | ConfigError`. Inputs are already normalized absolute paths; this function performs no I/O.

- [ ] **Step 1: Write `test_config.py` with these exact assertions:**

```python
assert select_store(ConfigInput('/p', '/p/k', None, None)) == StoreSelection('/p/k', 'explicit')
assert select_store(ConfigInput('/p', None, '/p/k', '/p/k')) == StoreSelection('/p/k', 'project')
assert select_store(ConfigInput('/p', None, None, '/p/old')) == StoreSelection('/p/old', 'review')
assert select_store(ConfigInput('/p', None, '/p/a', '/p/b')).code == 'conflicting_roots'
assert select_store(ConfigInput('/p', None, None, None)).code == 'missing_root'
```

Also assert the frozen input remains equal before and after each call. Explicit root overrides configuration only for that invocation; it neither migrates nor rewrites configuration.
- [ ] **Step 2: Run `python3.12 -m unittest discover -s runtimes/project-knowledge/tests -p test_config.py -v`.** Expect missing-module failure.
- [ ] **Step 3: Implement `select_store` using pattern matching over supplied values.** A configured project root and differing legacy review root return conflict unless an explicit invocation root was supplied. Use `.project-knowledge.json` with `schemaVersion: 1` and `knowledgeRoot` for the owned configuration. Read-only compatibility with `.monolithic-code-review/sources.json` uses its `knowledge.root`; no automatic migration.
- [ ] **Step 4: Rerun Step 2.** Expect all cases passing without creating any files.
- [ ] **Step 5: Commit the config module, test, and documentation** with message `feat: select one shared project knowledge root`.

## Task 3: Independent launch with unchanged retrieval and write contracts

**Files:** Create `src/upf_knowledge/launcher.py`, `tests/test_launcher.py`, `tests/test_transport.py`; update owned `pyproject.toml` and README.

**Interfaces:** Consumes `select_store` and immutable vendor files. Produces `main(argv: list[str] | None = None) -> int` as the console entry point. Arguments: `--project PATH` (default current directory), `--root PATH` (optional), and `--check` (validate and report configuration without starting a server). Successful check prints JSON `{"ok":true,"root":"<absolute path>"}`; failures print `{"ok":false,"code":"<code>","message":"<detail>"}` to stderr and return 2.

- [ ] **Step 1: Write launcher tests for `missing_root`, `conflicting_roots`, `invalid_config`, `unreadable_root`, and `unsupported_platform`.** Assert status 2, exact error code, no server start, and no file creation. Relative config roots resolve against the project directory; explicit relative roots also resolve against `--project`. Test paths containing spaces. A valid existing root with `--check` returns 0 and the normalized root.
- [ ] **Step 2: Write `test_transport.py` against an installed wheel in a temporary virtual environment.** Start the executable outside the checkout, initialize through the inherited protocol client, list tools, and assert the set is exactly `knowledge_catalog`, `knowledge_find`, `knowledge_fetch`, `knowledge_links`, `knowledge_put`, `knowledge_patch`, `knowledge_add`. Create a valid unit with `if_version='new'`, fetch it, then issue two updates with the same returned token: assert one success, one version conflict, and the winning content remains. Read a long unit and assert truncation provides a continuation. Read an `assumed` unit and assert its provenance warning is retained. These are actual tool calls, not direct function mocks.
- [ ] **Step 3: Run `python3.12 -m unittest discover -s runtimes/project-knowledge/tests -v`.** Expect launch/transport failures before implementation. Dependencies must be installed; skipped transport tests do not count as passing qualification.
- [ ] **Step 4: Implement `main` as the effect boundary.** Check `sys.platform` before importing vendor code; accept Linux and macOS only. Read and validate config objects, normalize paths, use `select_store`, and require an existing readable directory. Load vendor modules from packaged `_vendor` paths in the dedicated server process, ahead of unrelated installed modules. Pass the selected root to the original server `main([root])`; do not reimplement its tools, storage, or token checks. Ensure stdout contains protocol traffic only during normal serving.
- [ ] **Step 5: Run the owned suite and the two unchanged upstream regression modules against the packaged vendor modules.** Expect all passing on Linux/macOS. The test harness may supply import paths; never edit upstream tests to force a pass. On Windows run config/platform tests without importing vendor modules. If inherited behavior fails a required regression, stop release and report the exact gap rather than patching vendored originals.
- [ ] **Step 6: Commit launcher, package metadata, tests, and docs** with message `feat: expose standalone project knowledge server`.

## Task 4: Standalone discovery and setup skills

**Files:** Create `plugins/project-knowledge/plugin.json`, `skills/discover-project-knowledge/SKILL.md`, `skills/setup-project-knowledge/SKILL.md` beneath that plugin; create `runtimes/project-knowledge/tests/test_skills.py`; update `docs/knowledge/README.md`.

**Interfaces:** The portable manifest identifies `project-knowledge` version `0.1.0` using fields accepted by the current core loader. The setup skill owns `.project-knowledge.json`; discovery consumes its selected root and the seven inherited tools. Neither skill assumes the review plugin is installed.

- [ ] **Step 1: Write `test_skills.py` asserting both skills have name/description frontmatter, the portable manifest points at the intended plugin identity, and owned discovery references the independent configuration rather than requiring `review-setup`.** Keep behavioral evaluation cases in `tests/fixtures/skill-cases.md`: empty project, existing review root, conflicting roots, user accepts defaults, human-authored rule becomes stale, and an unsupported platform.
- [ ] **Step 2: Run `python3.12 -m unittest discover -s runtimes/project-knowledge/tests -p test_skills.py -v`.** Expect missing-file failures.
- [ ] **Step 3: Adapt the discovery procedure into the owned skill, preserving attribution and the original vendored copy.** Preserve source-backed facts, explicit assumptions, selective refresh, and the catalog/find/fetch reading sequence. On changed sources, propose review of human-authored knowledge rather than silently replacing it. Do not claim timestamps prove freshness. Full fingerprint-based freshness belongs to follow-on Plan B.
- [ ] **Step 4: Write the setup skill with concrete proposed defaults.** Prefer an existing configured root; otherwise propose `.project-knowledge/knowledge` beneath the project. Ask for shared documents (default) or separate documents, using existing locations where present; otherwise propose `docs/` and `Codex/` respectively. Persist `documentMode`, `docsRoot`, and `vaultRoot` alongside `knowledgeRoot` after acceptance. Do not create a whole vault or register host tools here. Create only the accepted knowledge directory and config, preserving unrelated configuration keys. Conflicting existing roots require a choice; never merge automatically. These new path defaults are author proposals requiring plan review.
- [ ] **Step 5: Run Step 2, build the workspace, and run `pnpm --filter @agent-plugins/cli exec agent-plugin validate plugins/project-knowledge`.** Expect `{"ok":true}`. Evaluate each fixture case against the written skills; record observed outcomes in `docs/knowledge/skill-evaluation.md`. Static checks alone do not prove conversational behavior.
- [ ] **Step 6: Commit this task's plugin files, tests, and documentation** with message `feat: add independent knowledge setup and discovery skills`.

## Task 5: Qualification and consumer handoff

**Files:** Modify `.github/workflows/ci.yml`; create `runtimes/project-knowledge/tests/test_consumers.py`; update `docs/knowledge/README.md`.

**Interfaces:** Both consumer fixtures launch the same `upf-project-knowledge --project PATH`; neither owns another knowledge database. One fixture represents Continuity writing a source-backed decision and the other review retrieving it. This verifies the shared tool contract, not complete integration with either external plugin.

- [ ] **Step 1: Write `test_consumers.py` so two independent protocol client sessions connect to the same configured root.** Client A creates `4-rules/review-policy` with a source reference; client B finds and fetches that exact unit and version. Client B updates with the token; client A sees the update on its next fetch. Assert there is exactly one authoritative unit file and neither `.monolithic-code-review/knowledge` nor a second default directory was created. Restart the server between write and read to prove persistence.
- [ ] **Step 2: Run the test against the built wheel.** Expect failure if consumers diverge or packaged startup is broken; if it already passes, record it as an integration characterization test rather than fabricating a red phase.
- [ ] **Step 3: Add a Python knowledge job to the existing workflow.** Use Python 3.12 on Ubuntu and macOS for the complete suite including protocol dependencies; run platform/config checks on Windows. Keep the current Node 22 and pnpm 10.14.0 jobs intact. No release qualification may report skipped protocol tests as success.
- [ ] **Step 4: Run the complete Python suite and all five repository checks in Global Constraints.** Record commands, results, tested operating systems, dependency versions, and upstream pin in `docs/knowledge/README.md`. Do not infer a platform pass from another operating system's result.
- [ ] **Step 5: Document local installation and explicit server registration instructions.** Installation is `python3.12 -m pip install ./runtimes/project-knowledge`; server command is `upf-project-knowledge --project <absolute-project-path>`. Explain that the Python package and skill plugin are separate deliverables in this slice. Do not advertise existing vendor payloads as containing the new runtime, or claim automatic host installation.
- [ ] **Step 6: Commit qualification changes** with message `test: qualify shared knowledge plugin consumers`.

## Self-review and handoff

Coverage: independent extraction (Tasks 1/3), single project store (2/5), default-driven setup (4), reusable discovery (4), unchanged inherited contracts (1/3), qualification (5). The five Review Focus cases each have tests above. All public new types and functions are defined in their owning task; inherited interfaces are delegated.

Excluded requirements are assigned explicitly in the follow-on scope document: sessions and seven events, automatic eight-hour continuation, recovery, safe archive, retention count, incorporation, comprehensive freshness, and full consumer/host integration. Discovery modes and tracking behavior still need their own design. This plan does not claim to implement the complete draft.

Review the proposed package names, storage defaults, and initial operating-system limit before execution. No execution method has been selected. Recommended: subagent-driven execution, because packaging, inherited runtime compatibility, and shared-store concurrency need independent checks at task boundaries.

References: [pinned upstream](https://github.com/Monolith-INC/monolithic-code-review-toolkit/tree/3af148b44421521bb453be0abea05750e45f6f8a/adapters/knowledge); [Python frozen data records](https://docs.python.org/3/library/dataclasses.html); [Python explicit union types](https://docs.python.org/3/library/typing.html).
