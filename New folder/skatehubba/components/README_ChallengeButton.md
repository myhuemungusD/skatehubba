# ChallengeButton Component Usage

## Overview
The `ChallengeButton` is a reusable component that provides a consistent challenge interface across the SkateHubba app.

## Features
- ⚔️ Sword icon with consistent styling
- 🎨 Customizable styles via props
- ♿ Built-in accessibility support
- ✨ Glow effects and shadows
- 📱 Touch feedback and animations

## Basic Usage

```javascript
import ChallengeButton from '../components/ChallengeButton';

// Basic usage
<ChallengeButton onPress={() => onChallenge(skater)} />

// With custom styling
<ChallengeButton 
  onPress={() => onChallenge(skater)}
  style={{ backgroundColor: '#FFD600', borderColor: '#222' }}
/>
```

## Examples

### 1. In NearbySkaters Component
```javascript
<ChallengeButton 
  onPress={(e) => { e.stopPropagation(); onChallenge?.(item); }}
/>
```

### 2. In Featured Skater Cards
```javascript
<ChallengeButton 
  onPress={() => onChallenge(skater)}
  style={styles.challengeButtonOverride}
/>
```

### 3. In Live Sessions
```javascript
<ChallengeButton 
  onPress={() => console.log('Quick challenge initiated')}
  style={styles.quickChallengeBtn}
/>
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `onPress` | function | ✅ | Callback when button is pressed |
| `style` | object | ❌ | Custom styles to override defaults |

## Accessibility
- Built-in `accessibilityLabel`: "Challenge this skater"
- Built-in `accessibilityHint`: "Opens the challenge options"
- Proper touch target size (44x44 minimum)

## Styling
Default styles include:
- Dark background with yellow border
- Glow effects and shadows
- Rounded corners
- Proper padding and alignment

## Integration Points
- ✅ NearbySkaters
- ✅ LiveSeshScreen
- ✅ FeaturedSkaterCard
- 🔄 Ready for: ProfileScreen, LeaderboardScreen, etc.
