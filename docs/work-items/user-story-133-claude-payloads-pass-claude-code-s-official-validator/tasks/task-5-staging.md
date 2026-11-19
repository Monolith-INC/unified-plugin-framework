---
work_item_type: Task
type: Task
title: "Staging"
language: en
provider: linear
provider_id: null
parent_id: 'AGE-133'
---

## 🎯 What

The AGE-133 change is ready to run where it will be checked: the full suite passes locally and the pull request's CI runs on Ubuntu, Windows and macOS.

## 📋 Expected Behavior

- The local suite without type checking passes.
- CI installs the pinned Claude Code CLI and payload verification passes on every runner.

## ✅ Acceptance Criteria

- [ ] The local suite passes.
- [ ] The pull request's CI passes on Ubuntu, Windows and macOS.

## 🔧 Technical Notes

The Windows runner calls the CLI through `cmd.exe`; this is the first run of that path.

## 📄 Original Description

Default Staging Task for AGE-133.
