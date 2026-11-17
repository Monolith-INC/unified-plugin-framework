#!/usr/bin/env bash
set -euo pipefail
# A release launcher only; setup choices and installation remain in the shipped Node installer.
command -v node >/dev/null 2>&1 || { echo 'Node.js 22+ is required.' >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo 'curl is required to download the installer.' >&2; exit 1; }
UPF_INSTALL_SCRATCH=$(mktemp -d)
trap 'rm -rf "$UPF_INSTALL_SCRATCH"' EXIT
case "${UPF_VERSION:-}" in
  '') upf_release=latest/download ;;
  *) upf_release="download/v${UPF_VERSION#v}" ;;
esac
curl -fsSL "https://github.com/Monolith-INC/unified-plugin-framework/releases/${upf_release}/install.mjs" -o "$UPF_INSTALL_SCRATCH/install.mjs"
node "$UPF_INSTALL_SCRATCH/install.mjs" "$@"
