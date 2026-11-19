# Deferred work from the AGE-133 review

- source_plan: implementation-plan-user-story-133-claude-payloads-pass-claude-code-s-official-validator.md
  summary: Pin the Claude Code CLI as a workspace dev dependency so local verification uses the CI version.
  evidence: Locally `payloads:verify` uses whatever `claude` the contributor has (2.1.327 here) while CI pins 2.1.318; adding the package changes the lockfile and install footprint, which is its own decision.
- source_plan: implementation-plan-user-story-133-claude-payloads-pass-claude-code-s-official-validator.md
  summary: Run `claude plugin validate --strict` on the project marketplace setup writes, not only on plugin payloads.
  evidence: The description fix was checked by hand; no automated check runs the validator on a generated catalog.
- source_plan: implementation-plan-user-story-133-claude-payloads-pass-claude-code-s-official-validator.md
  summary: Move the manifest field readers out of `packages/core/src/index.ts` into their own module.
  evidence: The file is about 1,500 lines; this change moved only the author rule (`author.ts`), and the remaining readers are one cohesive family to move together.
- source_plan: implementation-plan-user-story-133-claude-payloads-pass-claude-code-s-official-validator.md
  summary: Decide whether the portable reader or each host adapter should require an author name.
  evidence: The Agent Plugins specification checks `author` by JSON type only; core now requires a name for every host because Claude Code does. AGE-134 aligns the reader with the specification and should settle it.
