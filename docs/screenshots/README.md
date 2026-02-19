# Screenshots & Visual Assets

> **Note:** No screenshots have been captured yet. This file is a contribution guide for when visual assets are added.

This directory will contain screenshots, GIFs, and visual assets for documentation and marketing purposes.

---

## 📁 Directory Structure

```
screenshots/
├── README.md                    # This file
├── game/                        # S.K.A.T.E. game screenshots
│   ├── lobby.png               # Game lobby / challenge screen
│   ├── recording-trick.gif     # Recording a trick (animated)
│   ├── judging.png             # Judging opponent's trick
│   ├── letters-display.png     # S.K.A.T.E. letter progression
│   ├── dispute.png             # Filing a dispute
│   └── game-won.png            # Victory screen
├── map/                         # Spot map screenshots
│   ├── map-overview.png        # Full map view with spots
│   ├── spot-details.png        # Individual spot detail view
│   └── spot-filter.png         # Filtering by type/tier
├── checkins/                    # Check-in feature
│   ├── checkin-prompt.png      # Geo-verified check-in screen
│   └── streak-display.png      # Streak tracker
├── leaderboard/                 # Leaderboard views
│   ├── global-leaderboard.png  # Top players globally
│   └── city-leaderboard.png    # City-specific rankings
├── trickmint/                   # Video upload feature
│   ├── upload-flow.png         # Video upload interface
│   └── trick-feed.png          # Public trick feed
├── profile/                     # User profiles
│   ├── profile-view.png        # User profile page
│   └── settings.png            # Account settings
├── mobile/                      # Mobile app mockups (when built)
│   ├── ios/                    # iOS screenshots
│   └── android/                # Android screenshots
└── marketing/                   # Marketing materials
    ├── hero-banner.png         # Hero image for README
    ├── demo-video-thumb.png    # Demo video thumbnail
    └── comparison-chart.png    # Feature comparison graphic
```

---

## 🎯 Priority Screenshots Needed

### Must-Have (for README)
These are critical for making the README compelling:

1. **Hero GIF** (`marketing/hero-banner.gif`)
   - Show: Recording trick → Upload → Opponent judges → Letter awarded
   - Duration: 5-10 seconds
   - Dimensions: 800x450px (16:9)
   - Use case: Top of README to immediately show the game

2. **Game Lobby** (`game/lobby.png`)
   - Show: List of active games, challenge buttons, opponent profiles
   - Dimensions: 1200x800px
   - Use case: Feature section in README

3. **Recording Trick** (`game/recording-trick.gif`)
   - Show: Camera interface, countdown, recording in progress
   - Duration: 3-5 seconds
   - Dimensions: 400x700px (mobile aspect ratio)
   - Use case: Game flow explanation

4. **Map View** (`map/map-overview.png`)
   - Show: Interactive map with 5-10 spot markers, filter panel
   - Dimensions: 1200x800px
   - Use case: Feature showcase

5. **Leaderboard** (`leaderboard/global-leaderboard.png`)
   - Show: Top 10 players with XP, avatars, levels
   - Dimensions: 800x600px
   - Use case: Feature showcase

---

## 📸 How to Capture Screenshots

### For Web App

#### Method 1: Browser DevTools (Recommended)
1. Open SkateHubba in Chrome/Firefox
2. Press `F12` to open DevTools
3. Click "Toggle Device Toolbar" (Ctrl+Shift+M)
4. Select device (e.g., iPhone 14, or custom dimensions)
5. Take screenshot:
   - Chrome: DevTools → 3-dot menu → "Capture screenshot"
   - Firefox: DevTools → Screenshot icon
6. Save to appropriate folder

#### Method 2: Full Page Screenshot
```bash
# Using Playwright (already installed)
npx playwright screenshot https://localhost:3000 --full-page screenshot.png
```

---

## 🎨 Screenshot Guidelines

### Quality Standards
- **Resolution:** Minimum 1200x800px for desktop, 400x700px for mobile
- **Format:** PNG for static images, GIF for animations (<5MB)
- **File Naming:** Use kebab-case (e.g., `game-lobby.png`, not `Game Lobby.png`)
- **No Personal Data:** Blur or use fake data (usernames like "demo_user")
- **Clean UI:** Hide dev tools, console, personal bookmarks

---

## 🚀 Next Steps

1. **Immediate (This Week)**
   - [ ] Capture hero GIF for README
   - [ ] Screenshot game lobby
   - [ ] Screenshot map view
   - [ ] Screenshot leaderboard

2. **Short-Term (This Month)**
   - [ ] Record 3-minute demo video
   - [ ] Create mobile app mockups (even if not functional)
   - [ ] Design marketing graphics

---

**Contribute:** Found a great screenshot opportunity? Capture it and open a PR!
