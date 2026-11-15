# Project knowledge runtime

This distribution packages the project knowledge store and MCP server from
[Monolith-INC/monolithic-code-review-toolkit](https://github.com/Monolith-INC/monolithic-code-review-toolkit),
pinned at commit `3af148b44421521bb453be0abea05750e45f6f8a`. The original source
files are kept unchanged under `runtimes/project-knowledge/vendor/review-knowledge/`;
`provenance.json` records their SHA-256 digests. The bundled MIT license is in the
same vendor directory.

Install the runtime with Python 3.12 or newer:

```sh
python3.12 -m pip install ./runtimes/project-knowledge
```

Register the server explicitly with the host application's MCP configuration,
using the absolute path to the target project:

```json
{
  "mcpServers": {
    "project-knowledge": {
      "command": "upf-project-knowledge",
      "args": ["--project", "/absolute/path/to/project"]
    }
  }
}
```

The equivalent server command is
`upf-project-knowledge --project <absolute-project-path>`. Installation and
registration are separate steps. The Python runtime and the skill plugin in
`plugins/project-knowledge/` are separate deliverables in this slice; installing
the runtime does not install the skill plugin or register a host server.

The upstream runtime currently uses `fcntl` for
file locking, so this first release supports Linux and macOS. Windows is not
supported. The runtime depends on `mcp>=2.0,<3` and `pydantic>=2.7,<3`; these
inherited version ranges do not guarantee compatibility with every future
release in those ranges.

Run the command with `--project PATH` to choose the target project, or pass
`--root PATH` for a one-run override. Relative roots are resolved from the
project directory. Add `--check` to validate the selected root without starting
the server; success prints its absolute path as JSON. The launcher requires an
existing readable directory and never creates a replacement store.

The original discovery procedure is retained in the vendor tree at
`plugins/monolithic-code-review-toolkit/skills/discover-project-knowledge/SKILL.md`.

Each target project uses one shared knowledge root. The owned project setting
uses `.project-knowledge.json` with `schemaVersion: 1` and `knowledgeRoot`.
An explicit root applies only to that invocation and does not rewrite settings.
When no project setting exists, the runtime can read the legacy
`.monolithic-code-review/sources.json` value at `knowledge.root`. It never
migrates that setting automatically. If the project setting and legacy setting
name different roots, selection returns a configuration error so callers can
resolve the choice explicitly.

## Standalone setup and discovery skills

The portable `project-knowledge` plugin provides `setup-project-knowledge` and
`discover-project-knowledge` without requiring the review plugin. Setup records
`.project-knowledge.json` and asks before choosing paths; discovery uses the
accepted `knowledgeRoot` and the inherited catalog, find, fetch, links, put,
patch, and add tools when available. Neither skill registers tools or creates a
complete vault. The owned discovery skill is adapted from the pinned upstream
procedure; the byte-preserved original remains under the vendor tree.

`runtimes/project-knowledge/tests/fixtures/skill-cases.md` contains manual
walkthrough cases. The accompanying evaluation report records expected outcomes
from reading the skill text; it does not claim model conversations were run.

## Qualification status

See [qualification results](qualification.md) for the exact commands, dependency
versions, test outcomes, platform boundary, and remaining packaging and
multi-process catalog limits.
