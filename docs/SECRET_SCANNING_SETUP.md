# Secret Scanning Setup Guide

This repository uses **multi-layer secret protection** to prevent accidental commits of sensitive credentials.

## 🛡️ Protection Layers

### Layer 1: Secretlint (Built-in) ✅

**Status:** Already installed and running

- **Type:** npm-based secret scanner
- **When it runs:** Every commit (pre-commit hook)
- **What it detects:** API keys, tokens, private keys, credentials
- **Configuration:** `.secretlintrc.json`

**No installation needed** - this runs automatically!

---

### Layer 2: Custom Environment Validation (Built-in) ✅

**Status:** Already installed and running

- **Type:** Custom Node.js script
- **When it runs:** Every commit (pre-commit hook)
- **What it detects:** Hardcoded Google API keys, GitHub tokens, Stripe keys, OpenAI keys, AWS credentials, MongoDB URIs, Slack webhooks
- **Script:** `scripts/validate-env.mjs`

**No installation needed** - this runs automatically!

---

### Layer 3: Gitleaks (Optional - Recommended) ⚡

**Status:** Runs in CI/CD, can be added to local pre-commit

- **Type:** Fast Go-based secret scanner
- **When it runs:** CI/CD (already configured), optionally on every commit
- **What it detects:** 100+ secret patterns with high accuracy
- **Configuration:** `.gitleaks.toml`

#### Installation Options:

**macOS:**

```bash
brew install gitleaks
```

**Linux:**

```bash
# Using wget
wget https://github.com/gitleaks/gitleaks/releases/download/v8.18.2/gitleaks_8.18.2_linux_x64.tar.gz
tar -xzf gitleaks_8.18.2_linux_x64.tar.gz
sudo mv gitleaks /usr/local/bin/
```

**Windows:**

```powershell
# Using Scoop
scoop install gitleaks

# Or download from GitHub releases
# https://github.com/gitleaks/gitleaks/releases
```

**Using Docker:**

```bash
docker pull zricethezav/gitleaks:latest
```

**Verify installation:**

```bash
gitleaks version
```

Once installed, the pre-commit hook will automatically use it!

---

### Layer 4: detect-secrets (Optional - Python) 🐍

**Status:** Optional, adds entropy-based detection

- **Type:** Python-based secret scanner from Yelp
- **When it runs:** Every commit (if installed)
- **What it detects:** High entropy strings, Base64 encoded secrets, custom patterns
- **Why use it:** Catches secrets that pattern-based scanners miss

#### Installation:

**Using pip:**

```bash
pip install detect-secrets
```

**Using pipx (recommended):**

```bash
# Install pipx if you don't have it
pip install pipx
pipx ensurepath

# Install detect-secrets
pipx install detect-secrets
```

**Verify installation:**

```bash
detect-secrets --version
```

#### First-time setup:

Create a baseline (this tells detect-secrets what's already in your repo):

```bash
detect-secrets scan --exclude-files pnpm-lock.yaml > .secrets.baseline
```

The pre-commit hook will automatically use it once installed!

---

### Layer 5: GitGuardian ggshield (Optional - Enterprise) 🏢

**Status:** Optional, enterprise-grade detection

- **Type:** Python-based scanner with cloud intelligence
- **When it runs:** Every commit (if installed)
- **What it detects:** 350+ secret types with low false positives
- **Why use it:** Best-in-class accuracy, integrates with GitGuardian platform

#### Installation:

**Using pip:**

```bash
pip install ggshield
```

**Using pipx (recommended):**

```bash
pipx install ggshield
```

**Verify installation:**

```bash
ggshield --version
```

#### Setup (Optional - for GitGuardian platform features):

1. Create a free account at https://dashboard.gitguardian.com/
2. Get your API key
3. Configure ggshield:
   ```bash
   ggshield auth login
   ```

**Note:** ggshield works without authentication but with limited features.

The pre-commit hook will automatically use it once installed!

---

## 🔧 How It Works

### On Every Commit:

The pre-commit hook (`./husky/pre-commit`) runs:

1. ✅ **Secretlint** - Always runs (npm-based)
2. ✅ **Environment Validation** - Always runs (custom script)
3. ⚡ **Gitleaks** - Runs if installed
4. 🐍 **detect-secrets** - Runs if installed
5. 🏢 **ggshield** - Runs if installed

### In CI/CD:

GitHub Actions (`.github/workflows/security.yml`) runs:

- ✅ Gitleaks on all commits and PRs
- ✅ CodeQL static analysis
- ✅ Dependency vulnerability scanning
- ✅ License compliance checking

---

## 🚀 Quick Start

### Recommended Setup (5 minutes):

**For Mac users:**

```bash
# Install gitleaks (fastest and most accurate)
brew install gitleaks

# That's it! The pre-commit hook will use it automatically
```

**For advanced users who want maximum protection:**

```bash
# Install all optional tools
brew install gitleaks
pipx install detect-secrets
pipx install ggshield

# Create detect-secrets baseline
detect-secrets scan --exclude-files pnpm-lock.yaml > .secrets.baseline

# All tools now run automatically on every commit!
```

---

## 🧪 Testing Your Setup

### Test the pre-commit hook:

```bash
# Run the secret scanner manually
pnpm run scan:secrets

# Or test a commit (will be blocked if secrets are found)
echo "AWS_KEY=AKIAIOSFODNN7EXAMPLE" > test-secret.txt
git add test-secret.txt
git commit -m "test: secret detection"
# ❌ Should be blocked!

# Clean up
git reset HEAD test-secret.txt
rm test-secret.txt
```

### Check which tools are installed:

```bash
# The scan script will show you which tools are active
pnpm run scan:secrets
```

---

## 📋 CI/CD Integration

### GitHub Secret Scanning (Free for public repos)

**Already enabled** in your repository settings. GitHub automatically scans for:

- Tokens from 200+ service providers
- Private keys
- Database connection strings

### Enable GitHub Push Protection (Highly Recommended):

1. Go to: `https://github.com/[your-org]/skatehubba/settings/security_analysis`
2. Under "Secret scanning":
   - ✅ Enable "Secret scanning"
   - ✅ Enable "Push protection"

**Push protection will BLOCK pushes containing secrets** before they reach GitHub.

---

## 🔍 What Gets Detected?

Our multi-layer approach detects:

### Common Secrets:

- ✅ AWS access keys and secret keys
- ✅ Google API keys and OAuth tokens
- ✅ GitHub personal access tokens
- ✅ Stripe API keys
- ✅ OpenAI API keys
- ✅ Firebase credentials
- ✅ Database connection strings
- ✅ SSH private keys
- ✅ JWT tokens
- ✅ Slack webhooks
- ✅ Generic high-entropy strings

### Patterns:

- ✅ API key formats (e.g., `api_key=...`, `apiKey:...`)
- ✅ Authorization headers
- ✅ Connection strings
- ✅ Base64 encoded credentials
- ✅ Private key BEGIN/END blocks

---

## 🛑 What If Secrets Are Detected?

### During commit:

1. The pre-commit hook will **BLOCK** the commit
2. You'll see which tool found the secret
3. Remove the secret from your code
4. Use environment variables instead:

   ```typescript
   // ❌ BAD
   const apiKey = "sk-1234567890abcdef";

   // ✅ GOOD
   const apiKey = process.env.OPENAI_API_KEY;
   ```

### In CI/CD:

1. The build will **FAIL**
2. Check the CI logs for details
3. Remove the secret and force-push (after rotating the credential!)

### If a secret was already committed:

**Critical - Follow these steps:**

1. **Rotate the credential immediately** (invalidate the old one)
2. Remove the secret from your code
3. Commit the fix
4. **Rewrite Git history** to remove the secret:
   ```bash
   # Use BFG Repo-Cleaner or git-filter-repo
   # See: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository
   ```

---

## ⚙️ Configuration

### Secretlint

Edit `.secretlintrc.json`:

```json
{
  "rules": [
    {
      "id": "@secretlint/secretlint-rule-preset-recommend"
    }
  ],
  "allowMessagePatterns": ["/test/i", "/example/i"]
}
```

### Gitleaks

Edit `.gitleaks.toml` to customize patterns and allowlists.

### detect-secrets

Update baseline:

```bash
detect-secrets scan --exclude-files pnpm-lock.yaml --update .secrets.baseline
```

---

## 📊 Performance

| Tool           | Speed     | Accuracy           | False Positives |
| -------------- | --------- | ------------------ | --------------- |
| Secretlint     | Fast      | Good               | Low             |
| validate-env   | Very Fast | Excellent (custom) | Very Low        |
| Gitleaks       | Very Fast | Excellent          | Very Low        |
| detect-secrets | Fast      | Good               | Medium          |
| ggshield       | Fast      | Excellent          | Very Low        |

**Recommended for most users:** Built-in tools + Gitleaks

---

## 🤝 Contributing

When contributing to this repo:

1. Install at least **Gitleaks** for local development
2. Never commit `.env` files (already in `.gitignore`)
3. Use `process.env.*` for all secrets
4. Add test credentials to `.gitleaks.toml` allowlist if needed

---

## 📚 Resources

- [Gitleaks Documentation](https://github.com/gitleaks/gitleaks)
- [detect-secrets Documentation](https://github.com/Yelp/detect-secrets)
- [GitGuardian Documentation](https://docs.gitguardian.com/)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [OWASP Secret Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_CheatSheet.html)

---

## ❓ FAQ

**Q: Do I need to install all the optional tools?**
A: No! The built-in tools (Secretlint + validate-env) provide good protection. We recommend installing Gitleaks for the best balance of speed and accuracy.

**Q: Will this slow down my commits?**
A: Minimal impact - typically adds 1-3 seconds per commit. The security benefit far outweighs the small delay.

**Q: Can I skip the secret scan for a specific commit?**
A: Technically yes with `git commit --no-verify`, but **this is strongly discouraged**. If you must, understand the risks.

**Q: What about Firebase API keys in the code?**
A: Firebase public API keys (like `apiKey: "AIza..."` in config) are **not secrets** - they're meant to be public. They're already allowlisted in `.gitleaks.toml`.

**Q: I got a false positive - what do I do?**
A: Add it to the appropriate allowlist:

- For Gitleaks: Update `.gitleaks.toml`
- For detect-secrets: Run `detect-secrets audit .secrets.baseline`
- For Secretlint: Update `.secretlintrc.json`

---

**Last Updated:** 2026-02-11
**Maintained by:** SkateHubba Security Team
