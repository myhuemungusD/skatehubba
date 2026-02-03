# Check-in Endpoint Specification

## Route

`POST /api/checkins`

## Description

Records a trick check-in at a skate spot. Users submit video proof of landing a trick at a verified location. The system validates the submission, stores the check-in, and awards XP points based on trick difficulty and spot tier.

## Zod Input Schema

```typescript
import { z } from "zod";

export const CheckInInput = z.object({
  uid: z.string().min(1, "User ID is required"),
  spotId: z.string().min(1, "Spot ID is required"),
  trick: z.string().min(1, "Trick name is required"),
  videoUrl: z.string().url("Valid video URL is required"),
});

export type CheckInInput = z.infer<typeof CheckInInput>;
```

## Zod Output Schema

```typescript
import { z } from "zod";

export const CheckInOutput = z.object({
  status: z.enum(["ok", "fail"]),
  awardedPoints: z.number().int().min(0),
  checkInId: z.string().optional(),
  message: z.string().optional(),
});

export type CheckInOutput = z.infer<typeof CheckInOutput>;
```

## Business Rules

1. **Authentication Required**: User must be authenticated via Firebase. UID from request must match authenticated user.
2. **Spot Validation**: spotId must reference a valid spot in the database.
3. **Duplicate Prevention**: Users cannot check in to the same spot with the same trick within 24 hours.
4. **Point Calculation**:
   - Base points: 10 XP per check-in
   - Trick difficulty bonus: +5-50 XP based on trick tier
   - First trick at spot bonus: +25 XP
   - Pro user bonus: +10% XP
5. **Video Storage**: videoUrl must be a valid Firebase Storage or external video URL.

## Usage Flow from Frontend

1. User opens AR camera at skate spot
2. User records trick and uploads video to Firebase Storage
3. Frontend calls `POST /api/checkins` with uid, spotId, trick, videoUrl
4. Backend validates, stores check-in, calculates points
5. Frontend receives response and updates user XP display

## Dependencies

- **Firebase Admin SDK**: Token verification and user lookup
- **PostgreSQL/Firestore**: Store check-in records
- **Firebase Storage**: Video file storage (URL validation)

## Error Responses

| Status | Code              | Description                          |
| ------ | ----------------- | ------------------------------------ |
| 400    | INVALID_INPUT     | Request body fails Zod validation    |
| 401    | UNAUTHORIZED      | Invalid or missing Firebase token    |
| 403    | FORBIDDEN         | UID mismatch with authenticated user |
| 404    | SPOT_NOT_FOUND    | spotId does not exist                |
| 409    | DUPLICATE_CHECKIN | Same trick at spot within 24 hours   |
| 500    | INTERNAL_ERROR    | Server error during processing       |

## Example Request

```json
{
  "uid": "firebase-user-id-123",
  "spotId": "spot-abc-456",
  "trick": "kickflip",
  "videoUrl": "https://storage.googleapis.com/skatehubba/videos/clip123.mp4"
}
```

## Example Response (Success)

```json
{
  "status": "ok",
  "awardedPoints": 35,
  "checkInId": "checkin-xyz-789",
  "message": "Kickflip landed! +35 XP"
}
```

## Example Response (Failure)

```json
{
  "status": "fail",
  "awardedPoints": 0,
  "message": "You already checked in with this trick today"
}
```
