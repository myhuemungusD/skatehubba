# Firebase Rules Verification CI Setup

## Overview

The Firebase rules verification job validates Firestore and Storage rules against Firebase servers during CI runs. This ensures rules are syntactically correct and deployable before merging.

## Security Measures

### 1. Token Masking
- The `FIREBASE_TOKEN` is automatically masked in GitHub Actions logs using `::add-mask::`
- The verification script additionally masks tokens in all output

### 2. Protected Branch Only
The job only runs when **ALL** conditions are met:
```yaml
if: |
  github.event_name == 'push' &&
  github.ref == 'refs/heads/main' &&
  github.repository == 'myhuemungusD/skatehubba1'
```

This ensures:
- ✅ Runs only on pushes to `main` branch
- ✅ Does NOT run on pull requests from forks (prevents secret exfiltration)
- ✅ Does NOT run on other branches
- ✅ Only runs on the original repository (not forks)

### 3. Secret Exfiltration Prevention
- Secrets are never accessible to forks
- Job is skipped on pull requests from forks
- Repository check prevents running on forked repositories

## Setup Instructions

### Step 1: Generate Firebase CI Token

```bash
# Login to Firebase CLI
firebase login:ci

# Copy the token that's generated
```

### Step 2: Add GitHub Secrets

Go to: `https://github.com/myhuemungusD/skatehubba1/settings/secrets/actions`

Add these secrets:

#### `FIREBASE_TOKEN`
- **Value**: The token from `firebase login:ci`
- **Usage**: Authenticates Firebase CLI in CI

#### `FIREBASE_PROJECT_ID`
- **Value**: `sk8hub-d7806` (or your Firebase project ID)
- **Usage**: Specifies which Firebase project to validate against

### Step 3: Configure Branch Protection (Optional but Recommended)

Go to: `https://github.com/myhuemungusD/skatehubba1/settings/branches`

For `main` branch:
- ✅ Require status checks to pass before merging
- ✅ Include "Firebase Rules Validation" check
- ✅ Require branches to be up to date before merging

## Workflow Behavior

### When Job Runs
- ✅ Direct pushes to `main` branch
- ✅ Merges to `main` branch

### When Job is Skipped
- ⏭️ Pull requests (even from same repo)
- ⏭️ Pushes to other branches
- ⏭️ Any activity on forked repositories

## Testing

To test the verification locally:

```bash
# Set environment variables
export FIREBASE_PROJECT_ID="sk8hub-d7806"
export FIREBASE_TOKEN="your-token-here"

# Run verification
node scripts/verify-firebase-rules.mjs
```

## Troubleshooting

### "FIREBASE_TOKEN environment variable is required"
- Ensure secrets are added in GitHub repository settings
- Check that the job condition allows it to run (main branch only)

### "Firebase rules validation failed"
- Review the error message in CI logs (token will be masked)
- Test rules locally: `firebase deploy --only firestore:rules --dry-run`

### Job is skipped
- This is expected for pull requests and non-main branches
- Only direct activity on `main` branch triggers validation

## Alternative: GitHub OIDC (Advanced)

For enhanced security without long-lived tokens, consider GitHub OIDC:

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - name: Authenticate to Google Cloud
    uses: google-github-actions/auth@v1
    with:
      workload_identity_provider: 'projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github'
      service_account: 'github-actions@YOUR_PROJECT.iam.gserviceaccount.com'
```

This eliminates the need for `FIREBASE_TOKEN` but requires additional GCP setup.

## Security Best Practices

✅ **DO:**
- Use GitHub Secrets for all sensitive values
- Limit job execution to protected branches
- Validate repository ownership in conditions
- Use `::add-mask::` for additional token masking
- Rotate tokens periodically

❌ **DON'T:**
- Commit tokens to repository
- Allow job to run on forks
- Echo or log token values
- Use same token for multiple projects
- Share tokens across teams

## References

- [GitHub Actions Security](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [Firebase CI Token](https://firebase.google.com/docs/cli#cli-ci-systems)
- [Preventing Secret Exfiltration](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-secrets)
