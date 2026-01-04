# Firebase Cloud Functions - SkateHubba

## Overview
This directory contains Firebase Cloud Functions for SkateHubba's Remote S.K.A.T.E. challenge system.

## Functions

### `createChallenge`
**Type:** HTTPS Callable  
**Purpose:** Create a new Remote S.K.A.T.E. challenge between two players

**Request Data:**
```typescript
{
  opponentUid: string;      // Firebase UID of the opponent
  clipUrl: string;          // URL to the challenge video clip
  clipDurationSec: number;  // Must be exactly 15 seconds (one-take rule)
  thumbnailUrl?: string;    // Optional thumbnail image URL
}
```

**Response:**
```typescript
{
  challengeId: string;  // Firestore document ID of the created challenge
}
```

**Features:**
- ✅ Authentication required
- ✅ One-take rule enforcement (must be 15 seconds)
- ✅ 24-hour deadline
- ✅ FCM push notifications to opponent
- ✅ Automatic forfeit tracking

## Local Development

### Prerequisites
- Node.js 18 or higher
- Firebase CLI: `npm install -g firebase-tools`
- Firebase project configured

### Setup

1. **Navigate to functions directory:**
   ```bash
   cd infra/firebase/functions
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build TypeScript:**
   ```bash
   npm run build
   ```

4. **Run locally (emulator):**
   ```bash
   firebase emulators:start --only functions
   ```

## Deployment

### Deploy to Firebase

1. **Login to Firebase:**
   ```bash
   firebase login
   ```

2. **Select your project:**
   ```bash
   firebase use <your-project-id>
   ```

3. **Deploy functions:**
   ```bash
   npm run deploy
   # or directly:
   firebase deploy --only functions
   ```

4. **Deploy specific function:**
   ```bash
   firebase deploy --only functions:createChallenge
   ```

## Testing

### Call from client app:
```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const createChallenge = httpsCallable(functions, 'createChallenge');

const result = await createChallenge({
  opponentUid: 'user-firebase-uid',
  clipUrl: 'https://storage.../clip.mp4',
  clipDurationSec: 15,
  thumbnailUrl: 'https://storage.../thumb.jpg'
});

console.log('Challenge created:', result.data.challengeId);
```

### Expected Firestore Structure

**challenges/{challengeId}**
```typescript
{
  id: string;
  createdBy: string;        // Creator's Firebase UID
  opponent: string;         // Opponent's Firebase UID
  participants: string[];   // [createdBy, opponent] - for queries
  status: 'pending' | 'accepted' | 'completed' | 'forfeit';
  createdAt: Timestamp;
  deadline: Timestamp;      // 24 hours from creation
  rules: {
    oneTake: true;
    durationSec: 15;
  };
  clipA: {
    url: string;
    thumbnailUrl?: string;
    durationSec: number;
  };
  clipB?: {               // Added when opponent responds
    url: string;
    thumbnailUrl?: string;
    durationSec: number;
  };
  winner: string | null;
}
```

**users/{userId}**
```typescript
{
  fcmToken?: string;      // For push notifications
  // ... other user fields
}
```

## Environment Variables

The function uses Firebase Admin SDK which automatically initializes with:
- Default Firebase credentials in deployed environment
- Service account JSON in local emulator

## Monitoring

### View logs:
```bash
npm run logs
# or:
firebase functions:log
```

### View specific function logs:
```bash
firebase functions:log --only createChallenge
```

## Security Rules

Make sure your Firestore security rules allow the function to write to the challenges collection:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /challenges/{challengeId} {
      // Functions can write
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        (request.auth.uid == resource.data.createdBy || 
         request.auth.uid == resource.data.opponent);
    }
  }
}
```

## Cost Optimization

- Function uses Firebase Functions v7 (2nd generation) for better performance
- Cold starts minimized with proper initialization
- FCM notifications sent only when token exists

## Troubleshooting

### Function deployment fails
- Check you're logged in: `firebase login`
- Verify project: `firebase use --list`
- Check Node version: `node --version` (should be 18+)

### Function times out
- Increase timeout in function config
- Check Firestore queries are efficient
- Verify network connectivity

### Push notifications not working
- Verify FCM token is stored in user document
- Check Firebase Console > Cloud Messaging
- Ensure FCM API is enabled in GCP

## Next Steps

To add more functions, simply export them from `index.ts`:

```typescript
export const respondToChallenge = functions.https.onCall(async (request) => {
  // Implementation
});

export const determineWinner = functions.https.onCall(async (request) => {
  // Implementation
});
```
