# This deployment is stable.

## DO NOT:

- Change pnpm version
- Change Node version
- Change Vercel build or output settings
- Delete pnpm-lock.yaml
- Change workspace structure

## If deployment breaks, revert to tag:

```bash
git checkout skatehubba-v1-deploy-stable
```

---

## What's safe to ignore (expected warnings):

These are safe and expected during builds:

- **Large chunk warning** — performance advisory only
- **"Asset not resolved at build time" warnings** — normal behavior
- **Build cache upload time** — no impact on production

None of these break production.
