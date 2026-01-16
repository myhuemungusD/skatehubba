# SkateHubba Git Workflow

This is the golden path for working with the skatehubba1 repo. Follow this every time to avoid merge conflicts, "ahead of origin" warnings, and accidental artifact commits.

## Rules of Engagement

1. **Never commit directly to `main`** — always use a feature branch + PR
2. **Always pull `main` first** — before creating a branch or rebasing
3. **Never commit build artifacts** — dist/, node_modules/, .turbo/, .env files are in .gitignore
4. **Use rebase to update your branch** — keeps PR history clean
5. **Delete your branch after merge** — prevents confusion and stale branches

---

## Golden Path Workflow

### 1. Start Work (Create Feature Branch)

```bash
# Make sure you're on main and up-to-date
git checkout main
git pull origin main

# Create your feature branch (use feat/, fix/, or chore/ prefix)
git checkout -b feat/your-feature-name

# Examples:
# git checkout -b feat/add-spot-rating
# git checkout -b fix/battle-timer-bug
# git checkout -b chore/update-deps
```

### 2. Make Changes & Commit

```bash
# Check what you've changed
git status

# Stage files you want to commit
git add <file1> <file2>
# Or stage all changes:
git add .

# Commit with a clear message
git commit -m "feat: add spot rating feature"

# Commit message format:
# feat: new feature
# fix: bug fix
# chore: maintenance (deps, config, etc.)
# docs: documentation only
```

### 3. Push Your Branch

```bash
# First push (creates remote branch)
git push -u origin feat/your-feature-name

# Subsequent pushes
git push
```

### 4. Open Pull Request

1. Go to https://github.com/myhuemungusD/skatehubba1/pulls
2. Click "New pull request"
3. Select your branch (feat/your-feature-name) → main
4. Fill in title and description
5. Click "Create pull request"
6. Vercel will auto-deploy a preview — check it before requesting review

### 5. Update Your Branch (If Main Changes)

If `main` gets updated while your PR is open, rebase to stay current:

```bash
# Make sure all your work is committed first
git status  # should show "nothing to commit"

# Fetch latest main
git fetch origin main

# Rebase your branch on top of main
git rebase origin/main
```

**If you get conflicts during rebase, see [Conflict Resolution](#conflict-resolution) below.**

After successful rebase:

```bash
# Push to update your PR (force push required after rebase)
git push --force-with-lease
```

### 6. Merge PR

Once approved and CI passes:

1. Click "Squash and merge" on GitHub
2. Edit the commit message if needed
3. Confirm merge

### 7. Cleanup After Merge

```bash
# Switch back to main
git checkout main

# Pull the merged changes
git pull origin main

# Delete your local branch
git branch -d feat/your-feature-name

# Delete remote branch (usually auto-deleted by GitHub, but if not:)
git push origin --delete feat/your-feature-name
```

**Why this matters:** After a squash-merge, your branch will show "ahead of origin/main" because the commit SHAs differ. The squashed commit on `main` is different from your branch commits. Deleting the branch prevents confusion.

---

## Conflict Resolution

If `git rebase origin/main` reports conflicts:

### Step 1: See What's Conflicted

```bash
git status
# Lists files with conflicts
```

### Step 2: Open Conflicted Files

VS Code will show conflict markers:

```
<<<<<<< HEAD (your changes)
your code here
=======
their code here (from main)
>>>>>>> commit-sha
```

### Step 3: Resolve Each Conflict

- Keep your changes, their changes, or merge both
- Delete the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
- Save the file

### Step 4: Mark as Resolved

```bash
git add <resolved-file>
```

### Step 5: Continue Rebase

```bash
git rebase --continue
```

If more conflicts appear, repeat steps 2-5 for each commit.

### Step 6: Push Updated Branch

```bash
git push --force-with-lease
```

### If Rebase Goes Wrong

Abort and try again:

```bash
git rebase --abort
```

---

## Common Scenarios

### "Your branch is ahead of 'origin/main' by X commits"

**Cause:** You committed directly to `main` or your branch diverged after a squash-merge.

**Fix:**

```bash
# If you committed to main accidentally:
git checkout -b feat/rescue-my-work  # save your work in a branch
git checkout main
git reset --hard origin/main  # reset main to match remote
git checkout feat/rescue-my-work  # switch back to your work
# Now open a PR from feat/rescue-my-work

# If your branch shows "ahead" after PR was merged:
# Just delete it — it's already merged
git checkout main
git pull origin main
git branch -d feat/old-branch-name
```

### "I accidentally committed build artifacts"

**Before pushing:**

```bash
# Remove files from staging
git reset HEAD .env dist/ node_modules/

# Unstage all and start over
git reset HEAD

# Re-add only the files you want
git add <correct-files>
git commit -m "your message"
```

**After pushing:**

```bash
# Reset last commit (keeps changes)
git reset HEAD~1

# Stage only correct files
git add <correct-files>
git commit -m "your message"

# Force push (only safe if no one else is working on this branch)
git push --force-with-lease
```

### "I need to sync my fork" (if you forked the repo)

```bash
# Add upstream remote (one-time setup)
git remote add upstream https://github.com/myhuemungusD/skatehubba1.git

# Fetch upstream changes
git fetch upstream

# Update your main
git checkout main
git merge upstream/main
git push origin main
```

### "CI failed because of lint/type errors"

Fix locally before pushing:

```bash
# Run lint
pnpm lint

# Run type check
pnpm typecheck

# Run tests
pnpm test

# Fix issues, then commit
git add .
git commit -m "fix: resolve lint errors"
git push
```

---

## Pre-Push Checklist

Before every `git push`:

- [ ] `git status` — no unexpected files staged
- [ ] No build artifacts (dist/, .turbo/, .env files)
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] Commit message follows format (feat/fix/chore: description)

---

## Branch Naming Conventions

- `feat/<name>` — new features (e.g., `feat/spot-check-in`)
- `fix/<name>` — bug fixes (e.g., `fix/battle-timer`)
- `chore/<name>` — maintenance (e.g., `chore/update-deps`)
- `docs/<name>` — documentation only (e.g., `docs/api-guide`)

Keep names short, lowercase, use hyphens (not underscores or spaces).

---

## Quick Reference

```bash
# Start work
git checkout main && git pull origin main
git checkout -b feat/my-feature

# Commit
git add . && git commit -m "feat: description"

# Push
git push -u origin feat/my-feature  # first time
git push  # after that

# Update branch with latest main
git fetch origin main
git rebase origin/main
git push --force-with-lease

# After PR merged
git checkout main && git pull origin main
git branch -d feat/my-feature
```

---

## Questions?

- Check open PRs for examples: https://github.com/myhuemungusD/skatehubba1/pulls
- See recent commits: https://github.com/myhuemungusD/skatehubba1/commits/main
- Review [CONTRIBUTING.md](../CONTRIBUTING.md) for code standards
