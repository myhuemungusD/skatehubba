# SkateHubba App - Current Screen Functions
## Last Updated: July 18, 2025

## 🏠 MAIN NAVIGATION SCREENS

### 1. **BetaDashboardScreen** (Primary Hub)
**File:** `features/beta/BetaDashboardScreen.js`
**Functions:**
- Dashboard data loading and refresh
- User stats display (Hubba Bucks, XP, Level)
- Feature navigation tiles
- Real-time analytics tracking
- Backend integration for user data
- Quick action buttons
- Performance metrics display

### 2. **AuthScreen** (Authentication)
**File:** `features/onboarding/AuthScreen.js`
**Functions:**
- User login/signup
- Firebase authentication
- Social media login integration
- Password reset functionality
- Account creation validation
- Session management

### 3. **OnboardingScreen** (First-time setup)
**File:** `features/onboarding/OnboardingScreen.js`
**Functions:**
- Welcome flow for new users
- Feature introduction carousel
- Terms acceptance
- Initial preferences setup
- Tutorial walkthrough
- Completion status tracking

## 🛒 COMMERCE & INVENTORY

### 4. **BetaShopScreen** (Main Shop)
**File:** `features/shop/BetaShopScreen.js`
**Functions:**
- Browse shop categories (Shoes, Decks, Clothes, Accessories)
- Item purchase with currency validation
- Rarity system (Common, Rare, Epic, Legendary)
- Real-time inventory updates
- Price calculations and discounts
- Purchase history tracking
- Wishlist functionality
- Search and filter capabilities

### 5. **ShopScreen** (Legacy Shop)
**File:** `features/shop/ShopScreen.js`
**Functions:**
- Basic shop interface
- Simple item browsing
- Purchase functionality
- Currency display

### 6. **BetaAvatarScreen** (Avatar & Inventory)
**File:** `features/avatar/BetaAvatarScreen.js`
**Functions:**
- Avatar customization system
- Inventory management
- Item equipping/unequipping
- Gear visualization
- Style combinations
- Equipment stats display
- Avatar photo capture
- Style sharing features

## 🔄 TRADING & SOCIAL

### 7. **BetaTradingScreen** (Item Trading)
**File:** `features/trading/BetaTradingScreen.js`
**Functions:**
- Secure peer-to-peer trading
- Trade request creation
- Trade proposal management
- Value calculation system
- Fraud prevention measures
- Transaction history
- Rating system for traders
- Atomic transaction processing

## 🎮 GAMEPLAY FEATURES

### 8. **ChallengeScreen** (Challenges Hub)
**File:** `features/challenge/ChallengeScreen.js`
**Functions:**
- Browse available challenges
- Challenge participation
- Progress tracking
- Reward claiming
- Leaderboard display
- Challenge creation

### 9. **SessionsScreen** (Skate Sessions)
**File:** `features/sessions/SessionsScreen.js`
**Functions:**
- Create skate sessions
- Join existing sessions
- Session location mapping
- Participant management
- Session rating system
- History tracking

### 10. **LobbyScreen** (Game Lobbies)
**File:** `features/lobby/LobbyScreen.js`
**Functions:**
- Create game lobbies
- Join multiplayer games
- Lobby chat functionality
- Game mode selection
- Player matching

### 11. **SubmitMoveScreen** (Trick Submission)
**File:** `features/challenges/SubmitMoveScreen.js`
**Functions:**
- Video trick recording
- Move submission system
- Trick validation
- Scoring mechanism
- Replay functionality

## 📍 LOCATION & CHECK-INS

### 12. **CheckinsScreen** (Location Check-ins)
**File:** `features/checkins/CheckinsScreen.js`
**Functions:**
- GPS-based check-ins
- Spot discovery
- Location rating
- Photo sharing
- Check-in history
- Points earning system

## 🔐 VERIFICATION & ADMIN

### 13. **VerificationScreen** (User Verification)
**File:** `features/verification/VerificationScreen.js`
**Functions:**
- Identity verification process
- Badge management
- Verification status display
- Document upload
- Approval workflow

### 14. **AdminScreen** (Admin Panel)
**File:** `features/admin/AdminScreen.js`
**Functions:**
- User management
- Content moderation
- System analytics
- Configuration management
- Beta feature toggles
- Admin-only actions

## 📱 UTILITY SCREENS

### 15. **NotificationScreen** (Notifications)
**File:** `features/notifications/NotificationScreen.js`
**Functions:**
- Push notification management
- Notification history
- Settings configuration
- Read/unread status
- Action buttons for notifications

### 16. **MoreScreen** (Additional Features)
**File:** `features/more/MoreScreen.js`
**Functions:**
- Secondary feature access
- Settings navigation
- Help and support
- About information
- Feature toggles

### 17. **ArchiveScreen** (Archive)
**File:** `features/archive/ArchiveScreen.js`
**Functions:**
- Historical data viewing
- Old content access
- Archive search
- Data export options

### 18. **ARScreen** (Augmented Reality)
**File:** `features/ar/ARScreen.js`
**Functions:**
- AR camera integration
- Virtual object placement
- AR challenges
- Photo/video capture with AR
- AR filters and effects

## 🛡️ UTILITY COMPONENTS

### 19. **ProtectedScreen** (Security Wrapper)
**File:** `components/ProtectedScreen.js`
**Functions:**
- Role-based access control
- Authentication verification
- Permission checking
- Screen access logging

## 📊 CURRENT BETA STATUS

**✅ Production Ready:**
- Currency system with validation
- Shop with item categories and rarity
- Avatar system with full customization
- Trading system with atomic transactions
- Authentication and security
- Real-time data synchronization

**🔧 Active Development:**
- AR features enhancement
- Advanced analytics
- Social features expansion
- Performance optimization

**📈 Key Metrics:**
- 19 total screens implemented
- 30+ backend services integrated
- Full Firebase integration
- Complete navigation system
- Comprehensive testing suite

## 🎯 NAVIGATION STRUCTURE

**Main Tabs (Bottom Navigation):**
1. Profile → BetaDashboardScreen
2. Challenges → ChallengeScreen  
3. Sessions → SessionsScreen
4. Shop → BetaShopScreen
5. More → MoreScreen (leads to other features)

**More Tab Includes:**
- Lobbies, Check-ins, Archive, Verification, Notifications, Admin, AR, Trading, Avatar

**Authentication Flow:**
1. OnboardingScreen (first time)
2. AuthScreen (login/signup)
3. MainTabNavigator (main app)
