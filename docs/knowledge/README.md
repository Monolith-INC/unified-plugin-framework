# Project knowledge runtime

This distribution packages the project knowledge store and MCP server from
[Monolith-INC/monolithic-code-review-toolkit](https://github.com/Monolith-INC/monolithic-code-review-toolkit),
pinned at commit `3af148b44421521bb453be0abea05750e45f6f8a`. The original source
files are kept unchanged under `runtimes/project-knowledge/vendor/review-knowledge/`;
`provenance.json` records their SHA-256 digests. The bundled MIT license is in the
same vendor directory.

Install the runtime with Python 3.12 or newer and run the
`upf-project-knowledge` command. The upstream runtime currently uses `fcntl` for
file locking, so this first release supports Linux and macOS. Windows is not
supported. The runtime depends on `mcp>=2.0,<3` and `pydantic>=2.7,<3`; these
inherited version ranges do not guarantee compatibility with every future
release in those ranges.

The original discovery procedure is retained in the vendor tree at
`plugins/monolithic-code-review-toolkit/skills/discover-project-knowledge/SKILL.md`.
