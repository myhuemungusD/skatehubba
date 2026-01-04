# Next Steps for Production Readiness

## Critical TODOs Before App Store/Play Store Submission

### 1. Video Upload to Firebase Storage ⚠️ HIGH PRIORITY
**Status:** Currently using placeholder URLs

**Implementation:**
```typescript
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

async function uploadVideoClip(uri: string, uid: string): Promise<string> {
  const storage = getStorage();
  const filename = `challenges/${uid}/${Date.now()}.mp4`;
  const storageRef = ref(storage, filename);
  
  // Convert local URI to blob
  const response = await fetch(uri);
  const blob = await response.blob();
  
  // Upload
  await uploadBytes(storageRef, blob);
  
  // Get download URL
  return await getDownloadURL(storageRef);
}
```

**Where to integrate:**
- `mobile/app/challenge/new.tsx` - Replace placeholder in `submitChallenge()`
- Add loading state during upload
- Handle upload errors gracefully

---

### 2. Opponent Selection UI ✅ IMPLEMENTED
**Status:** User browse screen with search - COMPLETE

**Current Implementation:**

✅ **User Browse Screen:** `mobile/app/(tabs)/users.tsx`
- Real-time search by name or email
- Browse all registered skaters
- Quick challenge button (video icon) on each user
- Click user card to view full profile
- Excludes current user from list
- Added to tab navigation as "Find" with people icon

**User Flow:**
1. User opens "Find" tab
2. Searches or browses skaters
3. Taps video icon → `/challenge/new` with `opponentUid` ✅
4. OR taps user card → profile → Challenge button ✅

**Backend Requirement:**
Add `/api/users` endpoint to Express:
```typescript
// server/routes.ts
app.get('/api/users', async (req, res) => {
  const users = await storage.getAllUsers();
  res.json(users.map(u => ({
    uid: u.uid,
    displayName: u.displayName,
    email: u.email,
    photoURL: u.photoURL
  })));
});
```

---

### 3. Server-Side Video Validation
**Status:** Function trusts client for duration

**Implementation:**
Add Firebase Storage trigger function:

```typescript
// infra/firebase/functions/index.ts
import { onFinalized } from "firebase-functions/v2/storage";
import ffprobe from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';

export const validateVideoUpload = onFinalized(async (event) => {
  const filePath = event.data.name;
  
  if (!filePath.startsWith('challenges/')) return;
  
  // Download file temporarily
  const tempFilePath = `/tmp/${path.basename(filePath)}`;
  await storage.bucket().file(filePath).download({ destination: tempFilePath });
  
  // Check duration with FFprobe
  const metadata = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(tempFilePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata);
    });
  });
  
  const duration = metadata.format.duration;
  
  // Enforce 15-second rule
  if (duration < 14.5 || duration > 15.5) {
    // Delete invalid video
    await storage.bucket().file(filePath).delete();
    throw new Error('Video must be exactly 15 seconds (one-take rule)');
  }
});
```

---

### 4. Push Notifications Setup
**Status:** FCM token not collected

**Implementation:**

**A. Collect FCM Tokens:**
```typescript
// mobile/src/hooks/useFCMToken.ts
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase.config';

export function useFCMToken(uid: string) {
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;

      const token = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-expo-project-id'
      });

      // Store in Firestore
      await updateDoc(doc(db, 'users', uid), {
        fcmToken: token.data
      });
    })();
  }, [uid]);
}
```

**B. Configure Expo Push Notifications:**
- Add EAS project ID to `app.json`
- Configure Firebase Cloud Messaging
- Test notifications on physical device

---

### 5. Firestore Security Rules
**Status:** Default rules (too permissive)

**Implementation:**
```javascript
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /challenges/{challengeId} {
      allow read: if request.auth != null && 
        request.auth.uid in resource.data.participants;
      
      allow create: if request.auth != null &&
        request.auth.uid == request.resource.data.createdBy;
      
      allow update: if request.auth != null &&
        request.auth.uid in resource.data.participants &&
        // Only allow opponent to add clipB
        (request.auth.uid == resource.data.opponent || 
         request.auth.uid == resource.data.createdBy);
    }
    
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId;
    }
  }
}
```

Deploy:
```bash
firebase deploy --only firestore:rules
```

---

### 6. Rate Limiting & Abuse Protection
**Status:** No rate limiting on Cloud Functions

**Implementation:**

**A. Add Firebase App Check:**
```typescript
// mobile/src/lib/firebase.config.ts
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider('your-recaptcha-site-key'),
  isTokenAutoRefreshEnabled: true
});
```

**B. Add Function-Level Rate Limiting:**
```typescript
// infra/firebase/functions/index.ts
export const createChallenge = functions.https.onCall({
  rateLimits: {
    maxConcurrentCalls: 10,
    maxCallsPerMinute: 5
  }
}, async (request) => {
  // ... existing code
});
```

---

### 7. Firestore Indexes
**Status:** May need composite indexes

**Required Indexes:**
```json
{
  "indexes": [
    {
      "collectionGroup": "challenges",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "participants", "arrayConfig": "CONTAINS" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

Deploy:
```bash
firebase deploy --only firestore:indexes
```

---

### 8. Error Tracking & Analytics
**Status:** No production monitoring

**Recommendations:**
- **Sentry:** Error tracking for mobile app
- **Firebase Analytics:** User behavior tracking
- **Firebase Crashlytics:** Crash reports

**Implementation:**
```typescript
// mobile/app/_layout.tsx
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'your-sentry-dsn',
  environment: __DEV__ ? 'development' : 'production',
});
```

---

### 9. Offline Mode & Data Persistence
**Status:** No offline support

**Implementation:**
```typescript
// Enable Firestore offline persistence
import { enableIndexedDbPersistence } from 'firebase/firestore';

enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    // Multiple tabs open, persistence enabled in first tab only
  } else if (err.code === 'unimplemented') {
    // Browser doesn't support
  }
});
```

---

### 10. App Store Assets
**Status:** Need production assets

**Required:**
- App icons (1024x1024 for iOS, various Android sizes)
- Screenshots (6.5", 5.5" for iOS; various Android)
- Privacy policy URL
- App description and keywords
- Demo video (optional but recommended)

---

## Testing Checklist

Before submission:
- [ ] Test video upload to Firebase Storage
- [ ] Verify opponent selection flow
- [ ] Test push notifications on physical device
- [ ] Validate 15-second video enforcement
- [ ] Test offline mode
- [ ] Check Firestore security rules
- [ ] Performance testing (Lighthouse, React Native Performance)
- [ ] Accessibility testing (screen readers, color contrast)
- [ ] Cross-platform testing (iOS + Android)
- [ ] Beta testing with TestFlight/Internal Testing

---

## Deployment Timeline

**Week 1: Core Features**
- Implement video upload
- Build opponent selection UI
- Set up FCM tokens

**Week 2: Security & Validation**
- Deploy Firestore rules
- Add server-side video validation
- Implement rate limiting

**Week 3: Polish & Testing**
- Error tracking setup
- Beta testing
- Bug fixes

**Week 4: Submission**
- Prepare App Store assets
- Submit to App Store Review
- Submit to Google Play Console

---

## Resources

- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
- [Firebase Storage](https://firebase.google.com/docs/storage)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Review Guidelines](https://play.google.com/about/developer-content-policy/)
