# Fork and upstream baseline

## Fork

| Item | Value | Checked |
| --- | --- | --- |
| Fork | `Monolith-INC/unified-plugin-framework`, public, created 2026-11-14 | GitHub metadata, 2026-11-15 |
| Parent | `Monolith-INC/agent-plugins-toolkit` (GitHub fork link) | GitHub metadata, 2026-11-15 |
| Pinned baseline | `b75aaa5c627599f1fdb25caff154e9a22d2e2640` ("AGE-13: record feature closeout ledger", 2026-08-10) | Local history, 2026-11-15 |
| Parent unchanged | Upstream `main` still points at the baseline commit | `git ls-remote upstream main`, 2026-11-15 |
| History | Original upstream history is kept; fork commits start after the baseline | `git merge-base --is-ancestor b75aaa5 main` |

## Clone procedure

```sh
git clone https://github.com/Monolith-INC/unified-plugin-framework.git
cd unified-plugin-framework
git remote add upstream https://github.com/Monolith-INC/agent-plugins-toolkit.git
git fetch upstream
git merge-base --is-ancestor b75aaa5c627599f1fdb25caff154e9a22d2e2640 HEAD && echo "baseline present"
```

`origin` is the fork; `upstream` is the original toolkit. Upstream changes come in only through a pull request from a sync branch (see AGE-86); never push to `upstream`.

Ownership and licensing are recorded in [ownership.md](ownership.md).
