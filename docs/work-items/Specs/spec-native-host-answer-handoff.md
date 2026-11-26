# Host adapter answer handoff

## Problem

UPF's question contract selects a host channel and normalizes a response, but the previous live exercise manually translated the actual host selection into a CLI input. Automatic integration remains unverified.

## Scope

Define a host-neutral adapter interface for input and output, with each concrete host adapter handling vendor-specific behavior. Investigate supported host protocols and integrate available native response boundaries with the existing UPF continuation. Preserve instance identity, stable option keys, custom answers, dismissal, explicit consent, and the existing fallbacks. Do not change dependency sources.

## Verification

Use host-shaped responses to cover valid, stale, duplicate, custom, and dismissed cases. Exercise the actual native control and continuation where the host exposes them, recording any host limitation.
