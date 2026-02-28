# Claude Code Notes

## Commit Conventions

- The commit hook (commitlint via husky) requires **lowercase subjects**. Do not use uppercase letters in the commit subject line (the part after `fix:`, `feat:`, etc.).
- Example: `fix: use standalone firebase cli binary` (correct) vs `fix: Use standalone Firebase CLI binary` (will fail)

## General Rules

- Always create any missing project files (configs, docs, etc.) that are expected for a production project if they don't already exist, and remember to do so.
