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
upf_base="https://github.com/Monolith-INC/unified-plugin-framework/releases/${upf_release}"
curl -fsSL "${upf_base}/install.mjs" -o "$UPF_INSTALL_SCRATCH/install.mjs"
curl -fsSL "${upf_base}/SHA256SUMS" -o "$UPF_INSTALL_SCRATCH/SHA256SUMS"
node -e '
const {createHash}=require("node:crypto");
const {readFileSync}=require("node:fs");
const [installer,checksums]=process.argv.slice(1);
const entries=readFileSync(checksums,"utf8").trim().split(/\r?\n/).filter(line=>line.endsWith("  install.mjs"));
const expected=entries.length===1 ? entries[0].split("  ")[0] : "";
const actual=createHash("sha256").update(readFileSync(installer)).digest("hex");
if(!/^[a-f0-9]{64}$/.test(expected) || actual!==expected) process.exit(1);
' "$UPF_INSTALL_SCRATCH/install.mjs" "$UPF_INSTALL_SCRATCH/SHA256SUMS" || {
  echo 'Installer checksum verification failed; nothing was executed.' >&2
  exit 1
}
node "$UPF_INSTALL_SCRATCH/install.mjs" "$@"
