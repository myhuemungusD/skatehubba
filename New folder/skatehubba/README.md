# SkateHubba

A social platform for skaters to connect, challenge, and progress together.

## Getting Started

### Prerequisites

- Node.js 14 or higher
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)

### Environment Setup

1. Copy `.env.template` to `.env`:
```bash
cp .env.template .env
```

2. Configure Firebase:
   - Go to the [Firebase Console](https://console.firebase.google.com)
   - Create a new project or select an existing one
   - Go to Project Settings > General
   - Under "Your apps", register a new web app if you haven't already
   - Copy the Firebase configuration values into your `.env` file

3. Install dependencies:
```bash
npm install
```

4. Start the development server:
```bash
npm start
```

### Firebase Security Rules

The application uses Firebase Security Rules to protect data. Below are the recommended rules for each collection:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isSignedIn() {
      return request.auth != null;
    }
    
    function isOwner(userId) {
      return request.auth.uid == userId;
    }
    
    function isVerified() {
      return request.auth.token.verified == true;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if true;
      allow create: if isSignedIn() && isOwner(userId);
      allow update: if isSignedIn() && isOwner(userId);
      allow delete: if isSignedIn() && isOwner(userId);
      
      // User's private data
      match /private/{document=**} {
        allow read, write: if isSignedIn() && isOwner(userId);
      }
    }
    
    // Challenges collection
    match /challenges/{challengeId} {
      allow read: if true;
      allow create: if isSignedIn();
      allow update: if isSignedIn() && (
        resource.data.creatorId == request.auth.uid ||
        resource.data.participantId == request.auth.uid
      );
      allow delete: if isSignedIn() && resource.data.creatorId == request.auth.uid;
    }
    
    // Sessions collection
    match /sessions/{sessionId} {
      allow read: if true;
      allow create: if isSignedIn();
      allow update: if isSignedIn() && resource.data.creatorId == request.auth.uid;
      allow delete: if isSignedIn() && resource.data.creatorId == request.auth.uid;
    }
    
    // Checkins collection
    match /checkins/{checkinId} {
      allow read: if true;
      allow create: if isSignedIn();
      allow update, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
    }
    
    // Verifications collection
    match /verifications/{verificationId} {
      allow read: if true;
      allow create: if isSignedIn() && isVerified();
      allow update: if isSignedIn() && (
        resource.data.verifierId == request.auth.uid ||
        resource.data.targetUserId == request.auth.uid
      );
      allow delete: if isSignedIn() && resource.data.verifierId == request.auth.uid;
    }
  }
}
```

These rules ensure:
- Public read access to most collections for discoverability
- Write access only to authenticated users
- Users can only modify their own data
- Verification requests can only be created by verified users
- Private user data is only accessible to the user themselves

### Security Best Practices

1. Environment Variables
   - Never commit `.env` files
   - Use `.env.template` as a reference
   - Keep Firebase configuration in environment variables

2. API Keys
   - Never hardcode API keys in the source code
   - Rotate API keys periodically
   - Use restricted API keys with minimal permissions

3. Authentication
   - Always validate user sessions on the server
   - Use secure password policies
   - Implement rate limiting for auth endpoints

4. Data Access
   - Follow the principle of least privilege
   - Validate all data on the server
   - Use Firebase Security Rules to enforce access control

5. File Storage
   - Validate file types and sizes
   - Scan uploads for malware
   - Use signed URLs for secure file access
