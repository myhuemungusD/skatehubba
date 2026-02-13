# App Store & Play Store Submission Checklist

## App Icons

### iOS (required resolutions)
- [ ] `1024x1024` — App Store icon (no transparency, no rounded corners)
- [ ] Source file: `mobile/assets/icon.png` (used by Expo to auto-generate all sizes)

### Android (required resolutions)
- [ ] `512x512` — Play Store hi-res icon
- [ ] `1024x500` — Feature graphic
- [ ] Adaptive icon foreground: `mobile/assets/adaptive-icon.png`

## Screenshots

### iOS (at least one set required)
- [ ] 6.7" display (iPhone 15 Pro Max) — 1290x2796 or 2796x1290
- [ ] 6.5" display (iPhone 14 Plus) — 1284x2778 or 2778x1284
- [ ] 5.5" display (iPhone 8 Plus) — 1242x2208 or 2208x1242
- [ ] 12.9" iPad Pro — 2048x2732 or 2732x2048 (if supportsTablet)

Place in: `mobile/store-assets/ios/screenshots/`

### Android (at least 2, up to 8)
- [ ] Phone — min 320px, max 3840px, aspect ratio 16:9 or 9:16
- [ ] 7" tablet (if targeting tablets)
- [ ] 10" tablet (if targeting tablets)

Place in: `mobile/store-assets/android/screenshots/`

## Store Listing

- [x] App name: SkateHubba
- [x] Short description (80 char max): defined in `store-listing.json`
- [x] Full description (4000 char max): defined in `store-listing.json`
- [x] Keywords: defined in `store-listing.json`
- [x] Category: Sports
- [x] Content / age rating: 12+ (App Store) / Teen (Play Store) — target audience 13+ (not directed to children under 13)

## Legal & Privacy

- [x] Privacy Policy URL: https://skatehubba.com/privacy
- [x] Terms of Service URL: https://skatehubba.com/terms
- [x] Contact email: support@skatehubba.com
- [ ] COPPA compliance declaration (app is not directed to children under 13; target audience 13+)
- [ ] Data safety form (Play Store) — camera, location, contacts usage

## EAS Configuration

- [x] `eas.json` production build profile configured
- [x] `eas.json` submit profiles for iOS and Android
- [ ] Replace `TODO` values in `eas.json` submit.production.ios with real Apple credentials:
  - `appleId` — Apple ID email for App Store Connect
  - `ascAppId` — App Store Connect app numeric ID
  - `appleTeamId` — Apple Developer Team ID
- [ ] Android: Upload signing key to EAS (`eas credentials`)
- [ ] Android: Create app in Google Play Console and link service account JSON

## Universal Links / Deep Linking

- [x] iOS: `associatedDomains` configured in `app.config.js`
- [x] Android: `intentFilters` configured in `app.config.js`
- [x] `apple-app-site-association` file at `client/public/.well-known/`
- [x] `assetlinks.json` file at `client/public/.well-known/`
- [ ] Replace `TEAM_ID` in `apple-app-site-association` with actual Apple Team ID
- [ ] Replace SHA-256 fingerprint in `assetlinks.json` with actual signing cert fingerprint

## Pre-Submission Testing

- [ ] Run `eas build --profile production --platform ios` and verify .ipa
- [ ] Run `eas build --profile production --platform android` and verify .aab
- [ ] Test deep links: `skatehubba://game/{id}` and `skatehubba://challenge/{id}`
- [ ] Test universal links: `https://skatehubba.com/game/{id}`
- [ ] Verify push notifications work on production build
- [ ] Run Detox smoke test on production build
