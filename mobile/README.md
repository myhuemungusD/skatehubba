# SkateHubba Mobile - React Native Expo App

**Production-ready mobile skateboarding platform for iOS & Android**

## 🎯 Features

- 🔐 **Firebase Authentication** - Email, phone, and Google sign-in
- 🎥 **Remote S.K.A.T.E.** - Challenge skaters with 15-second video clips
- 📍 **Spot Discovery** - Interactive map with AR check-ins
- 🏆 **Leaderboards** - Compete with skaters worldwide
- 📱 **Native Camera** - Record tricks with one-take rule
- 🔥 **Real-time Updates** - Firestore for live challenge status

## 📋 Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn
- iOS Simulator (macOS only) or Android Studio
- Expo account (free): https://expo.dev/signup
- Firebase project: https://console.firebase.google.com

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd mobile
npm install
```

### 2. Configure Environment Variables

Create `.env` file in `/mobile` directory:

```bash
cp .env.example .env
```

Edit `.env` and add your Firebase config from Firebase Console:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your-key-here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:ios:abc123

EXPO_PUBLIC_API_URL=http://localhost:5000
```

### 3. Start Development Server

```bash
npm start
```

This opens Expo Dev Tools. From there:
- Press `i` for iOS Simulator
- Press `a` for Android Emulator  
- Scan QR code with Expo Go app on physical device

## 📱 Running on Physical Device

### iOS (TestFlight - Recommended)

1. **Build with EAS:**
   ```bash
   npm install -g eas-cli
   eas login
   eas build --platform ios --profile preview
   ```

2. **Upload to TestFlight:**
   ```bash
   eas submit --platform ios
   ```

3. **Invite testers** via App Store Connect

### Android (Internal Testing)

1. **Build APK:**
   ```bash
   eas build --platform android --profile preview
   ```

2. **Download APK** from build URL and install on device

## 🏗️ Project Structure

```
mobile/
├── app/                    # Expo Router screens
│   ├── (tabs)/            # Tab navigation
│   │   ├── index.tsx      # Home screen
│   │   ├── map.tsx        # Spot discovery
│   │   ├── challenges.tsx # S.K.A.T.E. challenges
│   │   └── leaderboard.tsx
│   ├── challenge/
│   │   └── new.tsx        # Video recorder
│   ├── profile/
│   │   └── [uid].tsx      # User profiles
│   └── _layout.tsx        # Root layout
├── src/
│   ├── lib/               # Firebase, React Query
│   ├── hooks/             # Custom React hooks
│   ├── types/             # TypeScript types
│   └── components/        # Reusable components
├── assets/                # Images, icons
├── app.json              # Expo configuration
├── package.json          # Dependencies
└── tsconfig.json         # TypeScript config
```

## 🔧 Configuration

### Update App Metadata

Edit `app.json`:

```json
{
  "expo": {
    "name": "SkateHubba",
    "slug": "skatehubba",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.skatehubba.app"
    },
    "android": {
      "package": "com.skatehubba.app"
    }
  }
}
```

### Configure EAS Build

Create `eas.json`:

```json
{
  "build": {
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "distribution": "store"
    }
  }
}
```

## 🧪 Testing

### Run on Simulator

**iOS:**
```bash
npm run ios
```

**Android:**
```bash
npm run android
```

### End-to-End Testing

Integration with SkateHubba backend:

1. **Start backend server** (from root project):
   ```bash
   npm run dev
   ```

2. **Update API URL** in `.env`:
   ```env
   EXPO_PUBLIC_API_URL=http://localhost:5000
   ```

3. **Test features:**
   - Sign in with Firebase
   - Create challenge (calls Cloud Function)
   - View leaderboard (calls Express API)
   - Discover spots on map

## 🚢 Deployment

### Production Build

1. **iOS App Store:**
   ```bash
   eas build --platform ios --profile production
   eas submit --platform ios
   ```

2. **Google Play Store:**
   ```bash
   eas build --platform android --profile production
   eas submit --platform android
   ```

### Environment Setup

**Production `.env`:**
```env
EXPO_PUBLIC_API_URL=https://your-production-api.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-prod-project
# ... other prod Firebase config
```

## 🔗 Integration Points

### Firebase Cloud Functions

Mobile app calls Cloud Functions via `httpsCallable`:

```typescript
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase.config';

const createChallenge = httpsCallable(functions, 'createChallenge');

const result = await createChallenge({
  opponentUid: 'user-id',
  clipUrl: 'https://storage.../video.mp4',
  clipDurationSec: 15,
});
```

### Express Backend API

REST API calls for spots, leaderboard, profiles:

```typescript
import { apiRequest } from '@/lib/queryClient';

const spots = await apiRequest('/api/spots');
const leaderboard = await apiRequest('/api/leaderboard');
```

## 🎨 Customization

### Theme Colors

Edit `mobile/app/_layout.tsx`:

```typescript
headerStyle: { backgroundColor: '#0a0a0a' },
headerTintColor: '#ff6600', // Orange accent
```

### Add New Screens

1. Create file in `app/`:
   ```typescript
   // app/shop.tsx
   export default function ShopScreen() {
     return <View>...</View>;
   }
   ```

2. Add to tab navigation (`app/(tabs)/_layout.tsx`)

## 📚 Tech Stack

- **Framework:** React Native with Expo SDK 51
- **Routing:** Expo Router (file-based)
- **State:** React Query (TanStack Query)
- **Auth:** Firebase Authentication
- **Database:** Firestore (real-time) + PostgreSQL (backend)
- **Cloud:** Firebase Cloud Functions
- **Camera:** expo-camera
- **Maps:** react-native-maps
- **Location:** expo-location

## 🐛 Troubleshooting

### Common Issues

**Metro bundler cache:**
```bash
npx expo start -c
```

**Pod install fails (iOS):**
```bash
cd ios && pod install && cd ..
```

**EAS build fails:**
```bash
eas build:configure
eas build --clear-cache
```

**Firebase auth not working:**
- Check `.env` file has correct Firebase config
- Verify Firebase Auth is enabled in console
- Ensure iOS/Android app is registered in Firebase

## 📞 Support

- **Expo Docs:** https://docs.expo.dev
- **Firebase Docs:** https://firebase.google.com/docs
- **React Native:** https://reactnative.dev

## 🎯 Roadmap

- [ ] Video upload to Firebase Storage
- [ ] Push notifications for challenges
- [ ] AR trick viewer with WebXR
- [ ] Offline mode with local persistence
- [ ] Social sharing to Instagram/TikTok
- [ ] In-app purchases (HubbShop)

---

Built with ❤️ for the skateboarding community
