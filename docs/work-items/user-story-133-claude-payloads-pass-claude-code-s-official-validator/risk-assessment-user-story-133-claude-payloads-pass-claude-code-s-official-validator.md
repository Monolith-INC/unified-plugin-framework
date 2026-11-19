---
type: risk-assessment
story: AGE-133
status: active
---

# Risk assessment: Claude payloads pass Claude Code's official validator

## Why this change carries risk

UPF turns each plugin's portable source into a payload, the set of files a coding assistant installs. Until now, UPF checked its Claude Code payloads only against its own description of Claude Code's format. This change makes the build also run Claude Code's own checker, `claude plugin validate`, and fails the build on any warning. It also changes what the payloads contain: an author and a licence are added, and three entries naming default folders are removed.

The checker is a program UPF does not control, so the build now depends on it being installed and behaving the same way every time. The payload changes touch files that people already have installed. The risks below come from those two facts.

## Risks

### The checker cannot be installed or run on every CI machine

CI, the automated build that runs on every pull request, runs on Linux, Windows and macOS. Each machine now installs Claude Code's command-line program before checking payloads. On Windows, the program is started through the system command shell (`cmd.exe`), and that route has not run yet. If installation or start-up fails on one machine, every pull request shows a failed build there.

- **Likelihood:** medium, because the Windows route is new.
- **Impact:** blocks merging until fixed; no effect on users.
- **What the plan does:** the first pull request runs all three machines before anything merges. If Windows or macOS cannot run the checker, the fallback is to run it on Linux only, since the payload files are identical on every machine.

### The checker's rules change without warning

Claude Code is updated often, and a new version could add a warning that the current payloads trigger.

- **Likelihood:** low while the version is pinned; certain over time.
- **Impact:** a failed build with no change on UPF's side.
- **What the plan does:** CI installs one fixed version, 2.1.318, chosen to be at least two weeks old. Moving to a newer version is a deliberate change that runs the checks first. The cost is that new rules are only noticed when someone updates the pin.

### Developers without Claude Code cannot verify payloads locally

`pnpm payloads:verify` now needs the `claude` program. A developer who works only with Codex or Cursor would see verification fail.

- **Likelihood:** medium.
- **Impact:** an extra install for contributors; no effect on users.
- **What the plan does:** the failure says how to fix it: install the program, or point `CLAUDE_CODE_CLI` at it. The installation guide and quality-gates page name the requirement.

### Bundles from earlier releases stop installing

Installation checks a downloaded bundle against the current rules. Bundles from earlier releases still name the default folders that new payloads leave out.

- **Likelihood:** low.
- **Impact:** high if it happened, since older versions would fail to install.
- **What the plan does:** the adapter version stays the same, and the rules still accept the old entries when they name the default folders. A test covers an old-style bundle.

### Existing project marketplaces change on the next setup run

Each project has a small catalog file that lists the plugins installed for it. Catalogs written before this change have no description, so the next setup run writes the file once to add one.

- **Likelihood:** certain for existing projects.
- **Impact:** low; one extra file write, and a description the user wrote is never replaced.
- **What the plan does:** a test covers a new catalog, an older one and one with the user's own description.

### Other assistants do not receive the author and licence

Only the Claude Code payload carries the new author and licence. The Codex and Cursor payloads leave them out.

- **Likelihood:** certain.
- **Impact:** low; those payloads are unchanged from today.
- **What the plan does:** nothing in this change. Adding the fields to the other payloads is separate work.

## What remains open

Until the pull request's build passes on all three machines, the first risk is unproven. Every other risk has a test or a recovery message in place.
