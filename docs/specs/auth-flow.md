# Authentication Flow Specification

## Overview

Firebase-based authentication flow for SkateHubba across web and mobile platforms.

## Supported Authentication Methods

1. **Email/Password**: Standard email registration with verification
2. **Google Sign-In**: OAuth 2.0 via Firebase Auth
3. **Apple Sign-In**: iOS-only, required for App Store compliance
4. **Phone Auth**: SMS verification (mobile only)

## Zod Schemas

### Auth State

```typescript
import { z } from "zod";

export const AuthState = z.object({
  isAuthenticated: z.boolean(),
  user: z
    .object({
      uid: z.string(),
      email: z.string().email().nullable(),
      displayName: z.string().nullable(),
      photoURL: z.string().url().nullable(),
      emailVerified: z.boolean(),
      providerId: z.enum(["password", "google.com", "apple.com", "phone"]),
    })
    .nullable(),
  loading: z.boolean(),
  error: z.string().nullable(),
});

export type AuthState = z.infer<typeof AuthState>;
```

### Sign-In Input

```typescript
export const EmailSignInInput = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type EmailSignInInput = z.infer<typeof EmailSignInInput>;
```

## Authentication Flow

### 1. Client-Side Initialization (Browser Only)

```typescript
// Only initialize Firebase in browser context
function getFirebaseClient() {
  if (typeof window === "undefined") {
    throw new Error("Firebase client cannot be initialized on server");
  }
  return initializeApp(firebaseConfig);
}
```

### 2. Sign-In Flow

1. User initiates sign-in (email/password or OAuth)
2. Firebase Auth handles credential verification
3. On success, Firebase returns ID token
4. Client stores auth state in Zustand
5. ID token sent with API requests in Authorization header

### 3. Token Verification (Server-Side)

```typescript
// Server middleware
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token" });
  }

  const token = authHeader.split("Bearer ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid auth token" });
  }
}
```

### 4. Session Management

- **Web**: JWT-based with secure HttpOnly cookies
- **Mobile**: Firebase token stored in secure storage
- **Token Refresh**: Automatic via Firebase SDK
- **Session Duration**: 7 days with silent refresh

## Authorization Header Format

```
Authorization: Bearer <firebase_id_token>
```

## Security Requirements

1. **HTTPS Only**: All auth endpoints require TLS
2. **CSRF Protection**: SameSite cookies + CSRF tokens
3. **Rate Limiting**: 5 failed attempts triggers 15-minute lockout
4. **Token Expiry**: ID tokens expire after 1 hour
5. **Secure Storage**: Never log tokens or credentials

## Protected Routes

All routes under `/api/*` (except `/api/health`) require valid Firebase token:

- `/api/checkins` - Check-in operations
- `/api/users/:uid` - User profile operations
- `/api/spots` - Spot CRUD operations
- `/api/challenges` - Challenge operations

## Error Responses

| Status | Code              | Description                              |
| ------ | ----------------- | ---------------------------------------- |
| 401    | UNAUTHENTICATED   | No token or invalid token                |
| 403    | FORBIDDEN         | Valid token but insufficient permissions |
| 429    | TOO_MANY_REQUESTS | Rate limit exceeded                      |

## Dependencies

- **Firebase Auth**: Primary authentication provider
- **Firebase Admin SDK**: Server-side token verification
- **express-session**: Session management (web)
- **Zustand**: Client-side auth state

## Frontend Hook

```typescript
import { useAuth } from "@/hooks/useAuth";

function App() {
  const { user, loading, signIn, signOut } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <SignInPage onSignIn={signIn} />;

  return <AuthenticatedApp user={user} onSignOut={signOut} />;
}
```
