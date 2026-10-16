---
name: safe-backup-and-verify
description: >-
  Creates timestamped local backups before code updates, verifies syntax and unit tests
  across Python and Node/Electron modules, and allows instant rollback if a regression occurs.
  Activate whenever the user asks for safe updates, backups, health checks, or verification.
---

# Safe Backup & Verification Skill

## 1. Create a Backup Snapshot Before Updating
Run the backup script before modifying core files:
```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/safe-backup-and-verify/scripts/backup_snapshot.ps1
```
Snapshots are stored in `.backups/<timestamp>/` (git-ignored so they never pollute commits).

## 2. Run Project Health & Regression Verification
Run the verification script after making edits:
```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/safe-backup-and-verify/scripts/verify_project.ps1
```
This script checks:
1. Python syntax compilation (`py_compile`) on `downloader/*.py`
2. Node.js syntax check (`node --check`) on `studio-browser/*.cjs`, `studio-browser/*.js`, `downloader/*.js`, and `downloader/studio_web/*.js`
3. Core unit test suites (`test_studio_text_clean.py`, `test_clip_split.cjs`, `test_threads_research_media.cjs`)
4. Sync check between `downloader/studio_web/threads-research-ui.js` and the embedded research block in `downloader/studio_web/workspace.js`.
