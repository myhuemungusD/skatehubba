# SkateHubba Mobile

Expo + React Native app for SkateHubba — discover skate spots, play S.K.A.T.E. battles, and climb the leaderboard.

## Status

- **Early MVP** — core screens and game flow implemented, not yet wired to CI or production.
- Auth: Firebase email + Google OAuth sign-in.
- S.K.A.T.E. battle: turn-based trick recording, dual-vote judging, letter tracking.
- Spot map: location-based spot discovery with tier markers.
- Leaderboard, user search, settings, and closet screens in place.
- Detox E2E scaffold added (smoke test + config only).

## Tech Stack

- **Framework**: Expo with expo-router (file-based routing)
- **Language**: TypeScript
- **State**: Zustand (client) + TanStack React Query (server)
- **Auth**: Firebase Auth with AsyncStorage persistence
- **Backend**: Firestore + Firebase Cloud Functions + Express API
- **Camera**: react-native-vision-camera (120fps trick recording)
- **Validation**: Zod schemas for Firestore documents

## Scripts

```bash
pnpm start          # Start Expo dev server
pnpm dev            # Start with dev client
pnpm ios            # Run on iOS
pnpm android        # Run on Android
pnpm e2e:smoke      # Run Detox smoke test (requires native build)
```

## Project Structure

```
mobile/
  app/              # Expo Router screens
    (tabs)/          # Tab navigation (hub, map, play, shop, closet)
    auth/            # Sign-in screen
    challenge/       # New challenge flow
    game/            # S.K.A.T.E. battle screen
    profile/         # User profile view
  src/
    components/      # Reusable UI components (game, common)
    hooks/           # Auth, game session, network hooks
    lib/             # Firebase config, query client, analytics
    store/           # Zustand stores (auth, game, network)
    theme.ts         # Design tokens (colors, spacing, typography)
    types/           # TypeScript interfaces
  e2e/              # Detox E2E tests
```

## Running Android E2E Tests

You can run Detox E2E tests on either an **emulator** or a **physical Android device**.

### Option A: Physical Device (recommended for low-RAM machines)

If you have less than 16 GB of RAM, a physical device avoids the 2-4 GB overhead of the emulator.

1. **Enable Developer Options** on your phone: Settings > About Phone > tap "Build Number" 7 times
2. **Enable USB Debugging**: Settings > Developer Options > USB Debugging > On
3. Plug in via USB and accept the debugging prompt on your phone
4. Verify the connection:

```bash
adb devices
# Should list your device
```

Then skip to **"Prebuild & bundle"** below. When running tests, use the physical device configuration:

```bash
pnpm run e2e:build:android
npx detox test --configuration android.att.debug
```

### Option B: Emulator

The emulator configuration expects an AVD named **`test`** (API 31, Pixel 6 profile).

#### Prerequisites

| Dependency | Version |
|------------|---------|
| Java (JDK) | 17 |
| Android SDK | API 31+ installed via SDK Manager |
| Android Emulator | installed via SDK Manager |
| System image | `system-images;android-31;default;x86_64` |
| RAM | 16 GB+ recommended |

### 1. Create the AVD (one-time setup)

**Recommended — use Android Studio UI:**

1. Open **Android Studio > Tools > Device Manager**
2. Click **Create Virtual Device**
3. Pick **Pixel 6**, hit Next
4. Pick **API 31** system image (download if needed), hit Next
5. Set AVD name to **`test`**, hit Finish

**Alternative — command line (macOS / Linux):**

```bash
sdkmanager "system-images;android-31;default;x86_64"

avdmanager create avd \
  --name test \
  --package "system-images;android-31;default;x86_64" \
  --device "pixel_6" \
  --force
```

**Alternative — command line (Windows PowerShell):**

First ensure you have command-line tools installed: **Android Studio > Settings > Languages & Frameworks > Android SDK > SDK Tools > check "Android SDK Command-line Tools (latest)" > Apply**.

```powershell
$SDK = "$env:LOCALAPPDATA\Android\Sdk"

# If "latest" doesn't exist, check what you have: ls "$SDK\cmdline-tools"
# and replace "latest" with the version folder name (e.g. "11.0")

& "$SDK\cmdline-tools\latest\bin\sdkmanager.bat" "system-images;android-31;default;x86_64"
& "$SDK\cmdline-tools\latest\bin\avdmanager.bat" create avd --name test --package "system-images;android-31;default;x86_64" --device "pixel_6" --force
```

### 2. Boot the emulator

**macOS / Linux:**

```bash
emulator -avd test -gpu swiftshader_indirect -noaudio -no-boot-anim
```

**Windows (PowerShell):**

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd test -gpu swiftshader_indirect -noaudio -no-boot-anim
```

Wait for the device to fully boot — verify with:

```bash
adb wait-for-device shell getprop sys.boot_completed
# Should print "1" when ready
```

### 3. Prebuild & bundle

```bash
cd mobile

# Generate the android/ native project
npx expo prebuild --platform android --no-install

# Pre-bundle JS into the APK (on Windows use mkdir without -p)
mkdir -p android/app/src/main/assets
npx expo export:embed --platform android --dev false --bundle-output android/app/src/main/assets/index.android.bundle --assets-dest android/app/src/main/res/
```

### 4. Build & run tests

```bash
# Build the debug APK + test APK
pnpm run e2e:build:android

# Run all Detox E2E tests
pnpm run e2e:test:android
```

### Troubleshooting

- **`sdkmanager` / `avdmanager` not found (Windows)** — Use the full path as shown above, or add `%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin` to your system PATH.
- **`emulator` not found (Windows)** — Use the full path, or add `%LOCALAPPDATA%\Android\Sdk\emulator` to your system PATH.
- **Emulator won't boot** — Make sure hardware virtualization is enabled in your BIOS/UEFI (Intel HAXM or AMD Hypervisor on Windows, KVM on Linux).
- **`adb devices` shows "offline"** — Run `adb kill-server && adb start-server` and reboot the emulator.
- **Gradle build fails** — Ensure `JAVA_HOME` points to JDK 17 and you have API 31 + build-tools installed.
- **`google-services.json` missing** — Place your Firebase config at `mobile/google-services.json` or use the CI placeholder from the workflow file.

## Notes

- E2E scripts require native projects (ios/android) to exist before running.
- Runtime dependencies are managed at the monorepo root via pnpm workspaces.
- Firebase config is shared from `@skatehubba/config` package.
