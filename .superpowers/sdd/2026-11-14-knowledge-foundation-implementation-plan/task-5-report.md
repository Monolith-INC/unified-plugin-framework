# Task 5 qualification report

## Python checks

Ran on Linux with Python 3.12.13, `mcp` 2.3.0, `pydantic` 2.14.3, and
`setuptools` 84.2.1. The package dependency ranges are `mcp>=2.0,<3` and
`pydantic>=2.7,<3`. The runtime wheel was built from a temporary copy of the
checkout, installed into the test environment, and launched outside the source
tree by both protocol suites. The bundled upstream source pin is
`3af148b44421521bb453be0abea05750e45f6f8a`.

Commands and results:

- `/tmp/upf-knowledge-validation/bin/python -m unittest discover -s runtimes/project-knowledge/tests -t runtimes/project-knowledge` — passed, 20 tests.
- `PYTHONPATH=runtimes/project-knowledge/vendor/review-knowledge/adapters/knowledge /tmp/upf-knowledge-validation/bin/python -m unittest discover -s runtimes/project-knowledge/vendor/review-knowledge/adapters/knowledge/tests -p 'test_*.py'` — passed, 60 inherited tests.

The consumer fixture starts a fresh server for each client, restarts it between
the write and read, updates with the fetched version token, and confirms that
the second client sees the update in the same single unit file. It also checks
that no review-plugin or default knowledge directory was created.

CI now runs the complete owned and inherited Python suites on Ubuntu and macOS
with Python 3.12. Windows runs configuration, platform-limitation, and packaging
checks; the Unix-only server tests are excluded. Only Linux was run locally, so
macOS and Windows results are pending CI.

## Repository checks

The root agent ran the required repository checks:

- `pnpm install --frozen-lockfile` — passed.
- `pnpm build` — passed.
- `pnpm typecheck` — passed.
- `pnpm payloads:verify` — passed.
- `pnpm test` — one existing release-evidence test fails because its referenced
  AGE-13 evidence documents are absent from the base commit; the test itself is
  unchanged. Other tests passed after correcting checkout fixture permissions.

## Skill evaluation boundary

The skill fixture cases were reviewed as static walkthroughs only. No assistant
conversation or integration with either external plugin was run. The consumer
test checks the shared server contract, not full external-plugin behavior.
