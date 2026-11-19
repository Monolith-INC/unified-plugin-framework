# Few-Shot Exemplar Priming: what the person sees

Worked examples of each screen, so the implementation and its tests aim at the same text. Tests assert the meaning (rows, ticks, host labels, exit code), not every space.

## 1. Host checklist

```
Which agent hosts should UPF set up?
  ↑/↓ move · space tick · a all · enter confirm

  [ ] All hosts
› [x] Codex
  [x] Claude Code
```

Enter with nothing ticked keeps the list open and adds:

```
Tick at least one host (space), then press enter.
```

## 2. Single choice

```
Where should work items live?
  ↑/↓ move · enter choose

› Local tracker (files in this project)
  Linear
```

## 3. Rejected text answer

```
Planning documents folder [docs/work-items]: ../plans
That folder must be inside the project, for example docs/work-items.
Planning documents folder [docs/work-items]:
```

## 4. Summary before applying

```
Install UPF 0.3.0 into /home/me/daybook
Hosts: Codex, Claude Code
Workflows: code-review, discovery, implementation
Tracker: local
...
› Apply this setup
  Cancel
```

## 5. Final report: installed, not ready yet (exit 2)

```
Installed, not ready yet. The workflows need these steps first:
- knowledge-content: Project knowledge has not been populated. Ask your agent to run discover-project-knowledge.
- codex / knowledge-server: ...
- claude / knowledge-server: ...
Other follow-ups:
- review: ...
```

## 6. Final report: one host failed (exit 1)

```
Setup did not finish. The workflows will not work until these steps succeed:
- claude / host-discovery: Claude Code was not found on this machine. Install it, then rerun the installer; completed steps are reused.
Codex: ready.
```

## Proposed changes to the approach

- Add these six examples to Design Notes as the target text (trimmed to the parts tests assert).
- Wizard task: the rejection message format `That <thing> must be <rule>, for example <valid value>.`
- Report task: a ready host is still listed (`Codex: ready.`) when another host fails.
