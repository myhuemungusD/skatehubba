# Firebase Security Configuration

This directory contains the secure Firebase configuration and security rules for SkateHubba.

## Files Overview

### `services/firebase.js`
- **Modular Firebase SDK** with environment variable configuration
- **Proper app initialization** using `getApps()` to prevent duplicate initialization
- **Cross-platform auth persistence** (AsyncStorage for React Native, browserLocalPersistence for web)
- **Error handling** with user-friendly error messages
- **Input validation** to ensure required configuration exists

### `firestore.rules`
- **Strict authentication requirements** - most operations require authentication
- **Data validation** - enforces required fields and data types
- **User ownership controls** - users can only modify their own data
- **Rate limiting support** - includes user_actions collection for spam prevention
- **Timestamp validation** - ensures proper timestamp usage
- **Default deny** - explicitly denies access to unlisted collections

### `storage.rules`
- **File type validation** - only allows specific image/video formats
- **Size limits** - prevents abuse with reasonable file size limits
- **User-based access control** - users can only upload to their own directories
- **Public read access** for avatars and challenge content
- **Authenticated read** for sensitive content like session clips
- **Default deny** - blocks access to unlisted storage paths

## Key Security Improvements

### 🔒 **Authentication & Authorization**
- All sensitive operations require authentication
- User ownership validation (users can only modify their own data)
- Role-based access where appropriate

### 🛡️ **Data Validation**
- Strict field validation (only allowed fields can be written)
- Data type enforcement (strings, numbers, timestamps)
- Business logic validation (status values, limits)

### 📝 **Rate Limiting**
- User actions tracking to prevent spam
- Timestamp-based operation throttling
- Action count limits per time window

### 🗂️ **File Security**
- File type restrictions (images: jpg, png, gif, webp; videos: mp4, mov, webm)
- Size limits per content type (avatars: 5MB, challenges: 50MB, etc.)
- Path-based access control
- Temporary upload cleanup

## Deployment

### Firestore Rules
```bash
firebase deploy --only firestore:rules
```

### Storage Rules
```bash
firebase deploy --only storage
```

### Both Rules
```bash
firebase deploy --only firestore:rules,storage
```

## Testing Rules

### Firestore Rules
```bash
firebase emulators:start --only firestore
npm run test:firestore-rules
```

### Storage Rules
```bash
firebase emulators:start --only storage
npm run test:storage-rules
```

## Security Checklist

- [x] Environment variables properly configured
- [x] Firebase app initialization secured
- [x] Authentication required for sensitive operations
- [x] User data access restricted to owners
- [x] Input validation enforced
- [x] File upload restrictions implemented
- [x] Rate limiting infrastructure in place
- [x] Default deny rules applied
- [x] Proper error handling implemented

## Next Steps

1. **Deploy the rules** to your Firebase project
2. **Test the security** with different user scenarios
3. **Monitor Firebase logs** for rule violations
4. **Set up Firebase App Check** for additional security
5. **Implement client-side rate limiting** to complement server rules