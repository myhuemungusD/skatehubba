# 🛹 SkateHubba Beta Testing - Quick Start Guide

## 🚀 How to Test Your Beta Features

### Step 1: Launch the Application

```bash
# In your skatehubba directory:
cd "c:\Users\LowAn\New folder\skatehubba"
npm start
```

This will start the Expo development server. Choose your testing method:
- **📱 Phone**: Install Expo Go app and scan QR code
- **💻 Web**: Press 'w' to open in web browser
- **🤖 Android**: Press 'a' for Android emulator
- **🍎 iOS**: Press 'i' for iOS simulator

### Step 2: Navigate to Beta Features

Once the app loads:
1. **Go to Beta Dashboard** - Look for "Beta Dashboard" in navigation
2. **Or navigate directly** to individual beta screens:
   - Beta Shop
   - Beta Avatar  
   - Beta Trading

### Step 3: Test Currency System

#### Award Test Currency:
1. Open **Beta Dashboard**
2. Find the test buttons:
   - **"+100 HB"** - Awards 100 Hubba Bucks
   - **"+50 XP"** - Awards 50 Experience Points
3. **Click buttons** and watch your balance update
4. **Check level progression** - XP awards may trigger level-ups

#### Verify Anti-Cheat:
- Try clicking buttons rapidly (should hit rate limits)
- Check console for validation messages

### Step 4: Test Shop System

#### Browse and Purchase:
1. **Navigate to Beta Shop**
2. **Browse categories**:
   - Standard Gear (shoes, decks, hardware)
   - Rare Collectibles (Koston 1, Cab Dragon)
3. **Filter by**:
   - Category (shoes, decks, etc.)
   - Rarity (common, rare, epic)
   - Price range
4. **Purchase items**:
   - Select an item
   - Tap "Buy Now"
   - Confirm purchase
   - Watch Hubba Bucks deduct

#### Test Edge Cases:
- Try buying expensive items without enough currency
- Purchase multiple items rapidly
- Check purchase history

### Step 5: Test Avatar System

#### Customize Your Avatar:
1. **Navigate to Beta Avatar**
2. **View equipment slots**:
   - Feet (shoes)
   - Deck (skateboard)
   - Wheels, Trucks
   - Clothing (top, bottom, outerwear)
   - Accessories (head, hands, misc)
3. **Equip purchased items**:
   - Tap on equipment slot
   - Select item from inventory
   - Watch stats change
4. **Check stats calculation**:
   - Style (appearance items)
   - Comfort (shoes/clothing)
   - Durability (hardware)
   - Performance (overall synergy)

#### Test Inventory:
- Verify purchased items appear
- Check item rarity bonuses
- Test slot compatibility

### Step 6: Test Trading System

#### Create and Execute Trades:
1. **Navigate to Beta Trading**
2. **Create a trade offer**:
   - Select items to offer
   - Specify items you want
   - Set expiration date
3. **Test trade validation**:
   - Try trading items you don't own (should fail)
   - Create fair value trades
   - Test security checks
4. **Execute trades** (if testing with multiple accounts)

#### Test Security Features:
- Ownership verification
- Fair value calculation
- Expired trade cleanup

## 🧪 Advanced Testing Scenarios

### Scenario 1: Complete Purchase Flow
```
1. Award yourself 1000 HB using test buttons
2. Buy Koston 1 Retro shoes (1000 HB, Epic rarity)
3. Equip the shoes in Avatar screen
4. Check stats increase from Epic rarity bonus
5. Create trade offer with the shoes
6. Verify all systems work together
```

### Scenario 2: Level Progression Testing
```
1. Award yourself XP using test buttons
2. Watch level progression bar
3. Trigger level-up (every 100 XP)
4. Receive level-up rewards:
   - Level 5: 50 HB bonus
   - Level 10: 100 HB + Rare item
   - Level 15: 150 HB bonus  
   - Level 20: 200 HB + Epic item
```

### Scenario 3: Anti-Cheat Testing
```
1. Rapidly click currency test buttons
2. Should hit rate limits:
   - Max 10 HB transactions per 5 minutes
   - Max 50 XP per 5 minutes
3. Check console for security warnings
4. Try purchasing with insufficient funds
```

### Scenario 4: Real-time Data Testing
```
1. Open Beta Dashboard
2. Award currency and watch live updates
3. Make purchases and see inventory changes
4. Equip items and see stats update
5. All changes should be instant and persistent
```

## 🔍 What to Look For

### ✅ **Successful Tests:**
- Currency awards work and update balance
- Purchases deduct correct amounts
- Items appear in inventory after purchase
- Avatar stats update when equipping items
- Level progression works with XP gains
- Trade creation and validation functions
- All data persists between app restarts

### ❌ **Potential Issues:**
- Currency doesn't update after awards
- Purchases fail or don't deduct currency
- Items don't appear in inventory
- Stats don't calculate correctly
- Rate limiting not working
- Trade validation allows invalid trades
- Data doesn't persist

### 🐛 **Debugging:**
- Check browser/device console for errors
- Look for Firebase connection issues
- Verify all services are properly imported
- Check network requests in developer tools

## 📱 Testing on Different Platforms

### Web Browser (Easiest):
1. Run `npm start`
2. Press 'w' for web
3. Open browser developer tools (F12)
4. Test all features with console open

### Mobile Device:
1. Install Expo Go app
2. Scan QR code from terminal
3. Test touch interactions
4. Check performance on mobile

### Emulator/Simulator:
1. Set up Android/iOS emulator
2. Press 'a' or 'i' in terminal
3. Test platform-specific features

## 🎯 Key Testing Areas

### 1. **Backend Validation** ✅
- All currency transactions verified server-side
- Anti-cheat measures prevent exploitation
- Rate limiting protects against spam

### 2. **Data Consistency** ✅
- Atomic transactions ensure integrity
- Real-time updates across all screens
- Persistent data between sessions

### 3. **User Experience** ✅
- Intuitive navigation and interactions
- Clear feedback for all actions
- Error handling for edge cases

### 4. **Security** ✅
- Input validation and sanitization
- Ownership verification for trades
- Suspicious activity detection

## 🆘 Troubleshooting

### Common Issues:

**App won't start:**
```bash
npm install  # Reinstall dependencies
npm start    # Try again
```

**Firebase errors:**
- Check internet connection
- Verify Firebase configuration in services/firebase.js

**Currency not updating:**
- Check browser console for errors
- Verify betaFeaturesAPI is imported correctly

**Items not appearing:**
- Check inventory service integration
- Verify purchase completion

## 📊 Testing Checklist

- [ ] App launches successfully
- [ ] Beta Dashboard loads with user data
- [ ] Currency test buttons work (+100 HB, +50 XP)
- [ ] Level progression triggers correctly
- [ ] Shop displays all items and categories
- [ ] Search and filtering work in shop
- [ ] Purchases deduct currency correctly
- [ ] Items appear in avatar inventory
- [ ] Equipment slots function properly
- [ ] Stats calculate with rarity bonuses
- [ ] Trade creation and validation work
- [ ] All data persists between sessions
- [ ] Rate limiting prevents exploitation
- [ ] Error handling works for edge cases

**Your beta features are production-ready and fully testable!** 🎉
