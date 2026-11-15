# Project knowledge qualification

Local qualification ran on Linux with Python 3.12.13, `mcp` 2.3.0,
`pydantic` 2.14.3, and `setuptools` 84.2.1. Declared dependency ranges are
`mcp>=2.0,<3` and `pydantic>=2.7,<3`. The bundled upstream source is pinned at
`3af148b44421521bb453be0abea05750e45f6f8a`.

Commands and results:

- `python -m unittest discover -s runtimes/project-knowledge/tests -t runtimes/project-knowledge` — passed, 21 tests.
- `PYTHONPATH=runtimes/project-knowledge/vendor/review-knowledge/adapters/knowledge python -m unittest discover -s runtimes/project-knowledge/vendor/review-knowledge/adapters/knowledge/tests -p 'test_*.py'` — passed, 60 inherited tests.
- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm test`, and `pnpm payloads:verify` — passed.

Last run 2026-11-15 on the AGE-90 branch, rebased onto `main` after AGE-88.

The Python wheel was built from a temporary checkout copy, installed, and
launched outside the source tree by both protocol suites. The consumer fixture
restarts the server between write and read and checks that two clients see the
same unit update. This validates the shared server contract, not complete
integration with either external plugin. Skill cases are static walkthroughs;
no assistant conversation or external-plugin integration was run.

Only Linux was run locally. CI is configured for full Python suites on Ubuntu
and macOS with Python 3.12; Windows runs configuration, platform, and packaging
checks but skips Unix-only server protocol tests. macOS and Windows results
remain pending CI.

Two qualification limits remain. Inherited catalog regeneration uses unit
locks, not a store-wide catalog lock: concurrent processes can leave a stale
catalog file as the last published snapshot, while unit data survives and live
tools reload the catalog. This does not establish full multi-process catalog
consistency. Also, source-distribution packaging is unqualified: the custom
wheel build copies vendor files outside `src`, and no source manifest currently
includes that tree. Checkout-to-wheel installation is covered; publication
needs source-distribution inclusion and a source-to-wheel check.
