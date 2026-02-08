# Lib

Shared utilities, services, and configuration for the SkateHubba client.

## Overview

This directory contains core utilities, API clients, Firebase configuration, and other shared services used throughout the application.

## Directory Structure

### API (`api/`)
HTTP client and error handling utilities.

**Files:**
- `client.ts` - API request wrapper with auth, CSRF, and timeout handling
- `errors.ts` - API error normalization and user-friendly messages
- `client.test.ts` - Client tests

**Features:**
- Automatic auth token injection
- CSRF token management
- Request timeout handling (default 30s)
- Error normalization
- Nonce support for replay attack prevention

### Analytics (`analytics/`)
Event tracking and analytics.

**Files:**
- `analytics.ts` - Event logging utilities

### Firebase (`firebase/`)
Firebase configuration and services.

**Files:**
- `config.ts` - Firebase app initialization
- `auth-types.ts` - Authentication type definitions
- `profile-service.ts` - User profile operations

### Firestore (`firestore/`)
Firestore utilities and hooks.

**Features:**
- Real-time listeners
- CRUD operations
- Type-safe queries

### Game (`game/`)
Game service and logic.

**Files:**
- `GameService.ts` - SKATE game business logic

### Profile (`profile/`)
Profile management utilities.

**Files:**
- `ensureProfile.ts` - Profile creation/validation

### Stores (`stores/`)
Zustand state management.

**Files:**
- `user.ts` - User profile store
- `user.test.ts` - Store tests

### Validation (`validation/`)
Input validation and sanitization.

**Files:**
- `betaSignup.ts` - Beta signup validation
- `sanitize.ts` - Input sanitization utilities (XSS prevention)
- `sanitize.test.ts` - Sanitization tests

**Available Sanitizers:**
- `sanitizeHTML()` - Escape HTML entities
- `sanitizeUsername()` - Validate/clean usernames
- `sanitizeDisplayName()` - Clean display names
- `sanitizeURL()` - Validate URLs (prevents javascript:, data:, etc.)
- `sanitizeEmail()` - Validate email addresses
- `sanitizeText()` - General text sanitization
- `stripHTMLTags()` - Remove all HTML tags
- `sanitizeFilename()` - Prevent path traversal
- `sanitizePhoneNumber()` - Validate phone numbers

### Core Files

- **`queryClient.ts`** - React Query configuration with intelligent retry logic
- **`useSocket.ts`** - Socket.io integration for real-time features
- **`logger.ts`** - Logging utilities
- **`distance.ts`** - Geolocation distance calculations
- **`utils.ts`** - General utility functions
- **`devAdmin.ts`** - Development admin mode detection

## Key Features

### Retry Logic
The API client includes intelligent retry logic:
- Retries network errors and 5xx server errors
- Does NOT retry client errors (4xx)
- Exponential backoff (1s, 2s, 4s)
- Special handling for rate limits (longer delays)

### Error Handling
Normalized error codes:
- `RATE_LIMIT` - Rate limiting (429)
- `REPLAY_DETECTED` - Nonce replay attack
- `QUOTA_EXCEEDED` - Quota exceeded
- `BANNED` - Account banned
- `UNAUTHORIZED` - Auth required (401/403)
- `VALIDATION_ERROR` - Invalid input (400)
- `UNKNOWN` - Other errors

### Security Features
- **CSRF Protection** - Automatic CSRF token handling
- **Input Sanitization** - XSS prevention utilities
- **Nonce Support** - Replay attack prevention
- **Timeout Handling** - Prevent hanging requests

## Testing

Run lib tests:

```bash
pnpm vitest run lib/
```

## Usage Examples

### API Client

```ts
import { apiRequest } from "./lib/api/client";

const data = await apiRequest<ResponseType>({
  method: "POST",
  path: "/api/endpoint",
  body: { foo: "bar" },
  timeout: 5000, // Optional, defaults to 30s
});
```

### Input Sanitization

```ts
import { sanitizeHTML, sanitizeUsername } from "./lib/validation/sanitize";

const safeHTML = sanitizeHTML(userInput);
const cleanUsername = sanitizeUsername(rawUsername);
```

### Query Client

```ts
import { queryClient } from "./lib/queryClient";

// Automatic retry with exponential backoff
useQuery({
  queryKey: ["data"],
  // Inherits retry logic from queryClient
});
```

## Best Practices

1. **Sanitize all user input** before rendering or sending to APIs
2. **Use the API client** for all HTTP requests
3. **Normalize errors** using the error utilities
4. **Add tests** for all new utilities
5. **Document functions** with JSDoc comments
