# Guest Mode Acceptance Test Checklist (Release Gate)

Run this checklist before every deploy when `VITE_GUEST_MODE=true`.

## Preflight

- Use an **Incognito/Private** window (no existing auth/session).
- Hard refresh once (Ctrl+Shift+R / Cmd+Shift+R).
- Confirm the target environment is correct:
  - Local: `client/.env.local`
  - Vercel Preview: Preview env vars
  - Vercel Production: Production env vars

---

## A) Cold start: new guest user

Steps:

1. Open Incognito.
2. Go to `/` (root).

Expected:

Console:

- `guest_mode=true`
- `uid=<non-empty>`
- `profile_exists=<true|false>` (if false initially, it should become true after ensure runs)

Firestore (Firebase Console → Firestore):

- `isGuest: true`
- `createdAt` is set (server timestamp)

Notes:

## B) Route enforcement (hard gate)

Steps (manual URL entry):

- `/profile`
- `/shop`
- `/closet`
- `/home`
- `/feed`

Expected:

## C) Game of SKATE persistence

Steps:

1. Go to `/skate`.
2. Start a match.
3. Perform at least one write action (challenge, move, or match creation).

Expected:

Persistence:

1. Refresh the page.
2. Return to `/skate`.

Expected:

## D) Firebase rules are strict (no public writes)

Firestore negative test:

1. Open DevTools console.
2. Attempt to write to a document not owned by your UID (pick any random path).

Expected:

Storage negative test:

1. Attempt an upload outside your allowed UID path.

Expected:

## E) Env toggle is the only source of truth

Expected:

- Local: `client/.env.local`
- Preview: Preview env vars
- Production: Production env vars

## F) Safety rails present

Expected:

- Guest mode: `/shop` redirects to `/map`

## Deploy Sign-off

If FAIL, link issue/notes here:
