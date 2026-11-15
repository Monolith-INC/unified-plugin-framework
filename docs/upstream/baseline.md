# Fork and upstream baseline

## Fork

| Item | Value | Checked |
| --- | --- | --- |
| Fork | `Monolith-INC/unified-plugin-framework`, public, created 2026-11-14 | GitHub metadata, 2026-11-15 |
| Parent | `Monolith-INC/agent-plugins-toolkit` (GitHub fork link) | GitHub metadata, 2026-11-15 |
| Pinned baseline | `b75aaa5c627599f1fdb25caff154e9a22d2e2640` ("AGE-13: record feature closeout ledger", 2026-08-10) | Local history, 2026-11-15 |
| Parent unchanged | As of 2026-11-15, upstream `main` still pointed at the baseline commit | `git ls-remote upstream main`, 2026-11-15 |
| History | Original upstream history is kept; fork commits start after the baseline | `git merge-base --is-ancestor b75aaa5c627599f1fdb25caff154e9a22d2e2640 origin/main` |

## Clone procedure

```sh
git clone https://github.com/Monolith-INC/unified-plugin-framework.git
cd unified-plugin-framework
git remote add upstream https://github.com/Monolith-INC/agent-plugins-toolkit.git
git remote set-url --push upstream no_push://disabled   # never push to the original toolkit
git config remote.upstream.tagOpt --no-tags                # keep upstream tags out of the fork
git fetch upstream
git merge-base --is-ancestor b75aaa5c627599f1fdb25caff154e9a22d2e2640 origin/main \
  && echo "baseline present in the fork" || echo "baseline missing from origin/main" >&2
```

`origin` is the fork; `upstream` is the original toolkit. Upstream changes come in only through a pull request from a sync branch; the detailed sync procedure is still to be defined (AGE-86). Pushing to `upstream` is disabled by the procedure above.

Ownership and licensing are recorded in [ownership.md](ownership.md).
