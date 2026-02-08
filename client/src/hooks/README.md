# Hooks

Custom React hooks for SkateHubba client application.

## Overview

This directory contains reusable React hooks that encapsulate common functionality and business logic across the application.

## Available Hooks

### Authentication & Authorization
- **`useAuth.ts`** - Core authentication hook with user state management
- **`useAuthListener.ts`** - Firebase auth state listener
- **`useUserRoles.ts`** - User role management and permission checks
- **`useEmailVerification.ts`** - Email verification flow

### Account & Profile
- **`useAccountTier.ts`** - User account tier (free/pro/premium) detection
- **`useBetaSignup.ts`** - Beta signup flow management

### Location & Map
- **`useGeolocation.ts`** - Browser geolocation with permission handling and browse mode fallback

### Game
- **`useSkateGame.ts`** - SKATE game state management
- **`useSkateGameRealtime.ts`** - Real-time game updates via Firestore

### UI & UX
- **`use-toast.ts`** - Toast notification system
- **`use-mobile.ts`** - Mobile viewport detection
- **`use-tricks.ts`** - Trick selection and management
- **`useSkipLink.ts`** - Accessibility skip link handler

### Performance
- **`usePerformanceMonitor.ts`** - Performance metrics tracking

## Testing

Key hooks have unit tests in `.test.ts` files (e.g., `useGeolocation.test.ts`, `use-toast.test.ts`). Run tests with:

```bash
pnpm vitest run hooks/
```

## Usage Examples

### useGeolocation

```tsx
const { latitude, longitude, status, hasLocation, retry } = useGeolocation();

if (status === "locating") {
  return <Spinner />;
}

if (!hasLocation) {
  return <button onClick={retry}>Enable Location</button>;
}

return <Map center={{ lat: latitude, lng: longitude }} />;
```

### useAccountTier

```tsx
const { tier, isPaidOrPro, isLoading } = useAccountTier();

if (isLoading) return <Spinner />;

return isPaidOrPro ? <ProFeature /> : <UpgradePrompt />;
```

### use-toast

```tsx
const { toast } = useToast();

const handleSuccess = () => {
  toast({
    title: "Success!",
    description: "Your changes have been saved.",
  });
};
```

## Best Practices

1. **Keep hooks focused** - Each hook should have a single responsibility
2. **Test thoroughly** - All hooks should have comprehensive unit tests
3. **Document dependencies** - Document any external service or API dependencies
4. **Handle errors gracefully** - Provide clear error states and messages
5. **Optimize performance** - Use `useCallback` and `useMemo` appropriately
6. **Type safety** - All hooks should have proper TypeScript types

## Adding New Hooks

When adding a new hook:

1. Create the hook file: `useMyFeature.ts`
2. Add comprehensive tests: `useMyFeature.test.ts`
3. Document the hook with JSDoc comments
4. Export the hook from `index.ts` if creating a barrel export
5. Update this README with hook description and usage example
