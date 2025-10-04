# 📱 Expo Go Setup Guide for SkateHubba

## ✅ Configuration Complete!

Your app is now configured for **Expo Go** compatibility:

### Changes Made:
1. ✅ **Removed conflicting plugins** from app.json
2. ✅ **Removed React Native Firebase** dependencies (not compatible with Expo Go)
3. ✅ **Removed Sentry** and other custom native modules
4. ✅ **Kept all Expo SDK** packages that work with Expo Go

## 📲 How to Use Expo Go:

### Step 1: Install Expo Go
- **iOS**: Download from App Store
- **Android**: Download from Google Play Store

### Step 2: Start Development Server
```bash
npx expo start
```

### Step 3: Connect to Your App
- **Option A**: Scan QR code with phone camera (iOS) or Expo Go app (Android)
- **Option B**: Use tunnel mode for external access:
```bash
npx expo start --tunnel
```

### Step 4: Test Your Features
Your app will load in Expo Go with these working features:
- ✅ Navigation between screens
- ✅ Basic UI components
- ✅ Local state management
- ✅ Camera functionality
- ✅ Location services
- ✅ Notifications
- ✅ Image picker
- ✅ Font loading

## 🚫 Temporary Limitations in Expo Go:

**The following features require custom development builds:**
- Firebase Firestore (real-time database)
- Firebase Authentication
- Push notifications with FCM
- Sentry crash reporting
- React Native Vector Icons

## 🔄 Workarounds for Testing:

### 1. **Mock Data for Database**
Instead of Firebase, use local JSON data:
```javascript
// Mock user data
const mockUserData = {
  hubbaBucks: 1500,
  level: 5,
  xp: 2400,
  inventory: []
};
```

### 2. **Local Authentication**
Use simple local storage for testing:
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
```

### 3. **Static Shop Data**
Use local shop items instead of Firestore:
```javascript
const mockShopItems = [
  { id: 1, name: 'Vulc Classics', price: 150 },
  // ... more items
];
```

## 🚀 Quick Start Commands:

```bash
# Install dependencies
npm install

# Start development server
npx expo start

# Start with tunnel (for external testing)
npx expo start --tunnel

# Clear cache if needed
npx expo start --clear
```

## 📱 Testing Workflow:

1. **Open Expo Go** on your phone
2. **Scan QR code** from terminal
3. **App loads** in Expo Go
4. **Test navigation** between screens
5. **Test UI interactions**
6. **Shake device** for developer menu

## 🔧 Development Tips:

- **Hot Reload**: Changes appear instantly
- **Fast Refresh**: Component state persists during edits
- **Developer Menu**: Shake device or press Ctrl+M (Android) / Cmd+D (iOS)
- **Console Logs**: View in terminal where `expo start` is running

## 🎯 Next Steps After Testing:

When you're ready for full features:
1. **Build custom development build** with `expo run:android` / `eas build`
2. **Re-enable Firebase** and other native modules
3. **Test on physical devices** with full functionality
4. **Deploy to app stores**

## 📞 Troubleshooting:

**QR Code Not Working?**
- Try tunnel mode: `npx expo start --tunnel`
- Ensure phone and computer on same WiFi

**App Crashes in Expo Go?**
- Check terminal for error messages
- Remove incompatible imports temporarily

**Slow Loading?**
- Use `--clear` flag to clear cache
- Restart Expo Go app

Your SkateHubba app is ready for Expo Go testing! 🛹
