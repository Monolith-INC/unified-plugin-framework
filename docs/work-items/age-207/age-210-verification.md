# AGE-210 — Mockup order and restart verification

- **FR-002.** A disposable workspace started with the Daybook brief, BMAD decision log, and one completed HTML direction. A separate CLI process reported no published options, and the brief and completed direction retained their SHA-256 values. After the other two actual BMAD renderer files were added, the handoff recorded all three in display order and a separate process recovered the same numbered paths before selection.
- **FR-003.** The test operator selected Option 3 (Branch Guide) in a separate process. The original renderer output, saved Option 3, and imported file matched SHA-256 `f01a701508ef01c64ff2d4e0afcfab19b8db920c41774d81cf4785a28cb7e558`. The pinned BMAD 6.12.0 decision-log command recorded the selection and feedback (“Keep the pickup branch above the deadline”). A later inspect returned the same selected option and import path.

Raw command output and files are in `/home/bhave/Projects/age-210-restart.zJy3oy/` on the test machine. The test replayed actual renderer outputs from the [live BMAD trial](live-provider-trial.md). It did not exercise document finalization.
