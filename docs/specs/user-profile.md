# User Profile Specification

## Overview

User profile data model and related operations for authenticated SkateHubba users.

## Zod Schema

```typescript
import { z } from "zod";

export const UserRole = z.enum(["skater", "filmer", "pro"]);
export type UserRole = z.infer<typeof UserRole>;

export const UserProfile = z.object({
  uid: z.string(),
  displayName: z.string(),
  email: z.string().email().optional(),
  photoURL: z.string().url().optional(),
  isPro: z.boolean().default(false),
  role: UserRole.default("skater"),
  xp: z.number().int().min(0).default(0),
  level: z.number().int().min(1).default(1),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type UserProfile = z.infer<typeof UserProfile>;
```

## Zustand Store Interface

```typescript
interface UserProfileStore {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  setUser: (user: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clear: () => void;
}
```

## Endpoints

### GET /api/users/:uid

Retrieve user profile by UID.

**Authorization**: Bearer token required. Users can only access their own profile unless admin.

**Response**:

```json
{
  "uid": "user-123",
  "displayName": "Tony Hawk",
  "photoURL": "https://example.com/photo.jpg",
  "isPro": true,
  "role": "pro",
  "xp": 15000,
  "level": 42
}
```

### PATCH /api/users/:uid

Update user profile fields.

**Authorization**: Bearer token required. Users can only update their own profile.

**Input Schema**:

```typescript
const UpdateUserInput = UserProfile.partial().omit({ uid: true, createdAt: true });
```

**Allowed Updates**:

- displayName
- photoURL
- role (restricted to self-assignment between skater/filmer)

### DELETE /api/users/:uid

Soft delete user account.

**Authorization**: Bearer token required. Users can only delete their own account.

## Business Rules

1. **Profile Creation**: Automatically created on first Firebase sign-in
2. **XP System**: XP accumulates from check-ins, challenges, and achievements
3. **Level Calculation**: Level = floor(XP / 500) + 1
4. **Pro Status**: Set via Stripe subscription webhook or admin action
5. **Role Selection**: Users choose their role during onboarding

## Dependencies

- **Firebase Auth**: User authentication and ID token verification
- **Firebase Firestore**: Real-time user profile storage
- **PostgreSQL**: Relational data for leaderboards and queries
- **Zustand**: Client-side state management

## Frontend Integration

```typescript
import { useUserProfile } from "@/lib/stores/user";

function ProfileComponent() {
  const { user, loading, error } = useUserProfile();

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!user) return <SignInPrompt />;

  return <ProfileCard user={user} />;
}
```
