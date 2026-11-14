# Project instructions

## Project scope

This repository is Unified Plugin Framework, a fork of Monolith-INC/agent-plugins-toolkit.

Use the existing Linear project **Unified Plugin Framework**:
- Project URL: https://linear.app/agentical-monolithics/project/unified-plugin-framework-fc59ba6d3fd4/overview
- Project identifier: P-AGE-6
- Project UUID: 93a112cc-ef52-49f7-9e04-3642a5f78a17
- Team: Agentical Monolithics Cognitivity (AGE)

Scope issue searches and new work to this project. Do not create a replacement project or mix work with the upstream Agent Plugins Toolkit project. Harness v0.7.0-rc.13 configures the Linear team only; this instruction supplies the narrower project scope. Plans and specifications belong under docs/work-items/.

## Implementation principles

Follow the linked Linear implementation plan. Keep pure planning separate from filesystem, network and process effects. Preserve immutable inputs and return explicit results. Reuse inherited toolkit behavior rather than creating duplicate implementations. Keep original dependency source files unchanged.

## Checks

Run pnpm install --frozen-lockfile, pnpm build, pnpm typecheck, pnpm test and pnpm payloads:verify when implementation changes require them.
