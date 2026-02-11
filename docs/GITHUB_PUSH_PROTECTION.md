# GitHub Push Protection Setup

GitHub Push Protection is a powerful feature that **blocks pushes containing secrets** before they reach your repository. This provides an additional layer of protection on top of local pre-commit hooks.

## 🎯 What is Push Protection?

Push Protection is GitHub's native secret scanning feature that:

- **Blocks git pushes** that contain detected secrets
- Works even if developers bypass local pre-commit hooks (with `--no-verify`)
- Scans for 200+ types of secrets from popular service providers
- Is **free for public repositories** and included in GitHub Advanced Security for private repos

## 🚀 Quick Setup (2 minutes)

### For Repository Admins:

1. **Navigate to Security Settings**

   ```
   https://github.com/myhuemungusD/skatehubba/settings/security_analysis
   ```

2. **Enable Secret Scanning**
   - Scroll to "Secret scanning" section
   - Click **"Enable"** next to "Secret scanning"
   - ✅ This will scan all commits and notify you of detected secrets

3. **Enable Push Protection** (Recommended)
   - In the same section, find "Push protection"
   - Click **"Enable"** next to "Push protection"
   - ✅ This will **block pushes** containing secrets

4. **Configure Advanced Options** (Optional)
   - Click "Configure" to customize:
     - Bypass permissions (who can bypass protection)
     - Notification settings
     - Custom patterns

### Expected Result:

Once enabled:

- ✅ Developers will **not be able to push** commits containing secrets
- ✅ They'll receive a clear error message with instructions
- ✅ Admins can review and manage detected secrets in Security tab

---

## 🧪 Testing Push Protection

### Test that it works:

1. **Create a test file with a fake secret** (on a test branch):

   ```bash
   git checkout -b test-push-protection
   echo "aws_access_key=AKIAIOSFODNN7EXAMPLE" > test.txt
   git add test.txt
   git commit -m "test: push protection"
   git push origin test-push-protection
   ```

2. **Expected result:**

   ```
   remote: ——— GitHub Secret Scanning ———————————————————————————————
   remote:
   remote: AWS Access Key ID detected in test.txt:1
   remote:
   remote: Push protection has prevented this push. To push anyway,
   remote: remove the secret or visit the URL below for options:
   remote: https://github.com/myhuemungusD/skatehubba/security/...
   remote: ——————————————————————————————————————————————————————————
   To github.com:myhuemungusD/skatehubba.git
    ! [remote rejected] test-push-protection -> test-push-protection (push declined due to secret scanning)
   ```

3. **Clean up:**
   ```bash
   git checkout main
   git branch -D test-push-protection
   ```

---

## 🛡️ How It Works

### Protection Flow:

```
┌──────────────────┐
│ Developer writes │
│ code with secret │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  git commit      │  ◄─── Pre-commit hook scans (Layer 1)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│    git push      │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────┐
│ GitHub Push Protection Scans     │  ◄─── GitHub scans (Layer 2)
│ - Detects AWS key                │
│ - BLOCKS the push                │
└──────────────────────────────────┘
         │
         ▼
    🚫 REJECTED
```

### Defense in Depth:

| Layer      | Tool                   | When                 | Can Be Bypassed?    |
| ---------- | ---------------------- | -------------------- | ------------------- |
| **Local**  | Pre-commit hooks       | Before commit        | Yes (--no-verify)   |
| **Local**  | CI/CD checks           | On pull request      | Yes (force push)    |
| **Remote** | GitHub Push Protection | Before push accepted | No (requires admin) |

**Push Protection is the final safeguard** that catches secrets even if local checks are bypassed.

---

## ⚙️ Configuration Options

### Bypass Permissions

When enabled, you can configure who can bypass push protection:

- **No one** - Strictest (recommended for production)
- **Repository admins only** - Moderate
- **Anyone with write access** - Least strict

**Recommendation:** Set to "Repository admins only" initially.

### Notification Settings

Configure where alerts are sent:

- ✅ Security tab (always)
- ✅ Email notifications to admins
- ✅ Dependabot alerts integration

### Custom Patterns

Add custom regex patterns for organization-specific secrets:

1. Go to: Organization Settings → Code security and analysis → Secret scanning
2. Add custom patterns:

   ```regex
   # Example: Internal API tokens
   /INTERNAL_TOKEN_[A-Z0-9]{32}/

   # Example: Database connection strings
   /mysql:\/\/[^\s"']+/
   ```

---

## 🚨 What Secrets Are Detected?

GitHub detects **200+ secret types**, including:

### Cloud Providers:

- ✅ AWS Access Keys (`AKIA...`)
- ✅ Google Cloud API Keys
- ✅ Azure Connection Strings
- ✅ DigitalOcean Personal Access Tokens

### Development Tools:

- ✅ GitHub Personal Access Tokens
- ✅ GitLab Personal Access Tokens
- ✅ NPM tokens
- ✅ PyPI tokens

### Payment & SaaS:

- ✅ Stripe API Keys (live keys)
- ✅ Twilio Auth Tokens
- ✅ SendGrid API Keys
- ✅ Slack Webhooks & Tokens

### Databases:

- ✅ MongoDB Connection Strings
- ✅ PostgreSQL Connection Strings
- ✅ Redis URLs with passwords

### API Services:

- ✅ OpenAI API Keys
- ✅ Anthropic API Keys
- ✅ Firebase Keys
- ✅ Sentry DSNs

[Full list](https://docs.github.com/en/code-security/secret-scanning/secret-scanning-patterns)

---

## 🔓 Bypassing Push Protection (Emergency Only)

Sometimes you may need to bypass protection (e.g., for test credentials):

### Option 1: Remove the Secret (Recommended)

```bash
# Remove the secret from your code
# Use environment variables instead
git add .
git commit --amend
git push
```

### Option 2: Mark as False Positive (GitHub UI)

1. Try to push (will be blocked)
2. Click the provided GitHub URL
3. Review the detected secret
4. Mark as "Test credential" or "False positive"
5. Push will be allowed

### Option 3: Admin Bypass (Last Resort)

1. Repository admin can temporarily disable push protection
2. Push the commit
3. **Immediately re-enable** push protection
4. Rotate the exposed credential

**Warning:** Bypassing should be rare and documented.

---

## 📊 Monitoring & Alerts

### Security Overview Dashboard

Access at: `https://github.com/myhuemungusD/skatehubba/security`

Shows:

- 🔍 Detected secrets (current & historical)
- 📈 Secret scanning alerts trend
- 🎯 Resolved vs. open alerts
- 👥 Who pushed secrets (for education)

### Managing Alerts

When a secret is detected:

1. **Immediately rotate the credential**
   - Invalidate the old secret on the service provider
   - Generate a new one
   - Update your `.env` files (locally)

2. **Remove from Git history**
   - Use BFG Repo-Cleaner or `git-filter-repo`
   - Force push (after coordinating with team)

3. **Mark alert as resolved** in GitHub Security tab

---

## 🤝 Team Education

### Share with your team:

**When push protection blocks you:**

1. ✅ **Don't panic** - it's working as designed!
2. ✅ **Don't bypass** - unless absolutely necessary
3. ✅ Remove the secret and use `process.env.*` instead
4. ✅ Update `.env.example` with variable names (not values)
5. ✅ Re-commit and push

**Example fix:**

```javascript
// ❌ Before (blocked by push protection)
const apiKey = "sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFGH";

// ✅ After (passes all checks)
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}
```

---

## 📚 Additional Resources

- [GitHub Secret Scanning Docs](https://docs.github.com/en/code-security/secret-scanning)
- [Push Protection Documentation](https://docs.github.com/en/code-security/secret-scanning/push-protection-for-repositories-and-organizations)
- [Managing Alerts](https://docs.github.com/en/code-security/secret-scanning/managing-alerts-from-secret-scanning)
- [Custom Patterns](https://docs.github.com/en/code-security/secret-scanning/defining-custom-patterns-for-secret-scanning)

---

## ❓ FAQ

**Q: Is push protection free?**
A: Yes for public repositories. For private repos, it requires GitHub Advanced Security (included in GitHub Enterprise Cloud).

**Q: Can developers disable it?**
A: No. Only repository admins can disable push protection.

**Q: What if we have test credentials?**
A: Add them to `.gitleaks.toml` allowlist or use the pattern `*_TEST_*` / `*_EXAMPLE_*` which is typically excluded.

**Q: Does it scan historical commits?**
A: Yes! GitHub scans your entire repository history and alerts you to existing secrets.

**Q: Will it slow down pushes?**
A: Minimal impact - typically adds 1-2 seconds to a push.

**Q: Can we customize which secrets are detected?**
A: Yes! You can add custom patterns in Organization settings.

---

**Status:** ⏳ **Action Required** - Admin must enable in repository settings

**Next Steps:**

1. ✅ Enable Secret Scanning
2. ✅ Enable Push Protection
3. ✅ Test with a dummy secret
4. ✅ Configure bypass permissions
5. ✅ Educate team members

---

**Last Updated:** 2026-02-11
**Maintained by:** SkateHubba Security Team
