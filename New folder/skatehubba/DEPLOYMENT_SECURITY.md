# 🚨 CRITICAL SECURITY DEPLOYMENT GUIDE

## ⚠️ IMMEDIATE ACTIONS REQUIRED

### 1. ROTATE EXPOSED API KEY (DO THIS NOW!)

```bash
# 1. Go to Firebase Console
open https://console.firebase.google.com/project/sk8hub-d7806/settings/general

# 2. Under "Your apps" > Web apps:
#    - Click the settings gear icon
#    - Click "Regenerate API key"
#    - Copy the NEW API key

# 3. Update your .env.local file with the NEW key
# EXPO_PUBLIC_FIREBASE_API_KEY=your_new_api_key_here

# 4. Delete the old exposed key from git history:
git filter-repo --path firebase* --invert-paths --force
# OR use GitHub's secret scanning remediation if available
```

### 2. ENABLE APP CHECK (Critical Security Layer)

```bash
# 1. Go to Firebase Console > App Check
open https://console.firebase.google.com/project/sk8hub-d7806/appcheck

# 2. Click "Get started"
# 3. Select your web app
# 4. Choose "reCAPTCHA v3" for web
# 5. Add your domain
# 6. Enable enforcement for Firestore and Storage
```

### 3. DEPLOY SECURITY RULES

```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize project (if not already done)
firebase init

# Deploy ONLY the security rules
firebase deploy --only firestore:rules,storage

# Verify deployment
firebase firestore:rules:list
```

### 4. VALIDATE WITH EMULATORS

```bash
# Start emulators
firebase emulators:start --only firestore,storage

# Run in separate terminal
npm test  # or your test command

# Test scenarios:
# - Unauthenticated users can't write
# - Users can only access their own data
# - File uploads respect size/type limits
```

## 📋 DEPLOYMENT CHECKLIST

- [ ] **API key rotated** and old key revoked
- [ ] **App Check enabled** with reCAPTCHA v3
- [ ] **Firestore rules deployed** and tested
- [ ] **Storage rules deployed** and tested
- [ ] **Environment variables secured** (.env.local not committed)
- [ ] **Git history cleaned** of exposed credentials
- [ ] **Auth flow tested** in development
- [ ] **Error handling tested** (network failures, auth errors)

## 🔧 POST-DEPLOYMENT TESTING

### Test Authentication Flow
```bash
# 1. Clear browser/app data
# 2. Try Google sign-in
# 3. Try anonymous sign-in
# 4. Try account upgrade
# 5. Verify Firestore user document creation
```

### Test Security Rules
```bash
# Try these scenarios (should all fail):
# - Unauthenticated write to /users
# - User A trying to modify User B's data
# - Upload files larger than limits
# - Upload disallowed file types
```

### Monitor Firebase Console
```bash
# Check for rule violations in:
# - Firestore > Rules playground
# - Storage > Rules
# - Auth > Users
```

## 🚨 IF SOMETHING BREAKS

### Rollback Plan
```bash
# 1. Revert to permissive rules (TEMPORARY)
firebase deploy --only firestore:rules --project sk8hub-d7806 <<EOF
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
EOF

# 2. Debug issues
# 3. Fix rules
# 4. Redeploy secure rules
```

### Common Issues
- **Auth not working**: Check App Check configuration
- **Rules too restrictive**: Check field validation in rules
- **File uploads failing**: Check storage rules and size limits
- **Performance issues**: Add compound indexes if needed

## 📊 SUCCESS METRICS

After deployment, verify:
- ✅ Zero unauthorized database access attempts
- ✅ All legitimate user actions work normally
- ✅ File uploads work within size/type limits
- ✅ Error messages are user-friendly (no technical Firebase errors)
- ✅ App Check is blocking bots/scrapers

## 🔄 ONGOING MAINTENANCE

### Weekly
- Review Firebase Console for rule violations
- Monitor authentication metrics
- Check for failed uploads/operations

### Monthly  
- Audit user permissions and roles
- Review file storage usage and costs
- Update dependencies for security patches

---

## ⚡ QUICK DEPLOYMENT COMMAND

```bash
# After rotating API key and enabling App Check:
firebase deploy --only firestore:rules,storage && echo "✅ Security rules deployed!"
```

**Remember: Your app is NOT secure until these rules are deployed!**