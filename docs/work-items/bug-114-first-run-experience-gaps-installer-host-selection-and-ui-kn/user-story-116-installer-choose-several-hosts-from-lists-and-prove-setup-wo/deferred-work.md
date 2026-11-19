# Deferred work: AGE-116

Low-severity findings from the final correctness review of the installer lock recovery (`d3bb23d`). Each needs outside file corruption or a kill at an exact moment.

- **Unreadable claim file stops recovery with a raw error.** `follow` in `scripts/install-release.mjs` rejects on a claim that is `null`, unreadable or garbled, while an unreadable lock is treated as held. The installer cannot write such a claim, because claims are staged and linked. Reason deferred: needs outside corruption.
- **An unreadable lock gives the "wait and rerun" message.** A lock file the installer cannot read waits the full two minutes and then suggests rerunning, which cannot help. Reason deferred: cosmetic; a message naming the permission problem would be clearer.
- **A kill during recovery can leave small files.** A staging file `installer.lock.reclaim-<id>.<uuid>`, or an orphan `.after-` link if the kill lands between the release unlinks. Reason deferred: harmless; later runs ignore them.
