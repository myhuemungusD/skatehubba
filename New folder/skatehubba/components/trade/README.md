# TradeModal Component

A comprehensive trading interface for rare skateboarding gear in the SkateHubba app.

## Features

### 🎨 **Visual Design**
- **Multi-step trade flow** with select → confirm → processing stages
- **Dark skateboarding theme** with professional UI/UX
- **Rarity-based color coding** for gear items
- **Interactive animations** and smooth transitions
- **Responsive design** for different screen sizes

### 🛹 **Gear Trading**
- **Horizontal scrollable inventories** for both users
- **Rarity indicators** with colored borders and dots
- **Item type icons** (deck, shoes, clothing, wheels, trucks)
- **Serial numbers** for authentic collectible tracking
- **Detailed item stats** modal on long press

### 👤 **User Interface**
- **User avatars and levels** prominently displayed
- **Selection summary** showing current trade offer
- **Trade preview** with clear visual confirmation
- **Real-time selection feedback** with highlighting

### ⚡ **Advanced Features**
- **Item validation** and fair trade checking
- **Multi-step confirmation** to prevent accidental trades
- **Processing states** with loading indicators
- **Error handling** and user feedback
- **Accessibility support** with proper labels

## Usage

### Basic Implementation

```jsx
import TradeModal from '../components/trade/TradeModal';

function MyComponent() {
  const [showTradeModal, setShowTradeModal] = useState(false);

  return (
    <>
      <TouchableOpacity onPress={() => setShowTradeModal(true)}>
        <Text>Open Trade</Text>
      </TouchableOpacity>

      <TradeModal
        visible={showTradeModal}
        yourUser={currentUser}
        theirUser={targetUser}
        onConfirm={(tradeData) => {
          console.log('Trade confirmed:', tradeData);
          // Send to backend
          setShowTradeModal(false);
        }}
        onCancel={() => setShowTradeModal(false)}
      />
    </>
  );
}
```

### Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `visible` | boolean | ✅ | Controls modal visibility |
| `yourUser` | object | ✅ | Current user data with inventory |
| `theirUser` | object | ✅ | Target user data with inventory |
| `onConfirm` | function | ✅ | Called when trade is confirmed |
| `onCancel` | function | ✅ | Called when modal is closed |

### User Object Structure

```jsx
const userObject = {
  name: "Username",
  avatar: "https://avatar-url.com/image.jpg",
  level: 12,
  hubbaBucks: 150,
  inventory: [
    {
      id: "unique-item-id",
      name: "Item Name",
      image: "https://item-image-url.com",
      serial: "27/100",
      rarity: "legendary", // legendary, epic, rare, common
      type: "shoes", // deck, shoes, clothing, wheels, trucks
      stats: {
        grip: 95,
        durability: 88,
        style: 92
      }
    }
  ]
};
```

### Trade Confirmation Data

```jsx
const tradeData = {
  myItem: {
    id: "osirisD3",
    name: "Osiris D3",
    serial: "27/100",
    rarity: "legendary"
    // ... full item object
  },
  theirItem: {
    id: "muskaHigh",
    name: "Muska Highs",
    serial: "11/100",
    rarity: "legendary"
    // ... full item object
  },
  tradeId: "trade_1642618291234",
  timestamp: "2024-01-19T15:45:23.456Z"
};
```

## Integration Examples

### 1. Profile Screen Integration

```jsx
// In ProfileScreen.js
import TradeModal from '../../components/trade/TradeModal';

export default function ProfileScreen({ route, navigation }) {
  const [showTradeModal, setShowTradeModal] = useState(false);
  
  const handleTrade = () => {
    setShowTradeModal(true);
  };

  return (
    <>
      {/* Profile content */}
      <TouchableOpacity onPress={handleTrade}>
        <Text>Trade</Text>
      </TouchableOpacity>

      <TradeModal
        visible={showTradeModal}
        yourUser={currentUser}
        theirUser={profileUser}
        onConfirm={handleTradeConfirm}
        onCancel={() => setShowTradeModal(false)}
      />
    </>
  );
}
```

### 2. Backend Integration

```jsx
// tradeService.js
export class TradeService {
  static async sendTradeProposal(tradeData) {
    try {
      const response = await fetch('/api/trades/propose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userToken}`
        },
        body: JSON.stringify({
          fromUserId: tradeData.fromUser.id,
          toUserId: tradeData.toUser.id,
          offeredItemId: tradeData.myItem.id,
          requestedItemId: tradeData.theirItem.id,
          tradeId: tradeData.tradeId,
          timestamp: tradeData.timestamp
        })
      });

      return await response.json();
    } catch (error) {
      console.error('Trade proposal failed:', error);
      throw error;
    }
  }
}
```

### 3. Real-time Updates

```jsx
// With WebSocket integration
useEffect(() => {
  const ws = new WebSocket('wss://api.skatehubba.com/trades');
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'TRADE_RECEIVED') {
      showTradeNotification(data.trade);
    }
  };

  return () => ws.close();
}, []);
```

## Rarity System

The component supports a 4-tier rarity system:

| Rarity | Color | Value | Description |
|--------|-------|-------|-------------|
| **Legendary** | Gold (#FFD700) | 4 | Ultra-rare items with unique serials |
| **Epic** | Purple (#9B59B6) | 3 | Rare limited edition items |
| **Rare** | Blue (#3498DB) | 2 | Uncommon items with good stats |
| **Common** | Gray (#95A5A6) | 1 | Basic items (not tradeable) |

## Item Types

Supported gear categories:

- **🛹 Deck** - Skateboard decks with pop/stability stats
- **👟 Shoes** - Skate shoes with grip/durability stats  
- **👕 Clothing** - Apparel with style/comfort stats
- **⚪ Wheels** - Skateboard wheels with speed/grip stats
- **🔧 Trucks** - Skateboard trucks with stability stats

## Trade Flow

1. **Selection Phase**
   - Users browse both inventories
   - Select one item to offer and one to request
   - View item details by long-pressing
   - See real-time selection summary

2. **Confirmation Phase**
   - Review complete trade details
   - See both items side by side
   - Read warning about trade finality
   - Confirm or go back to selection

3. **Processing Phase**
   - Show loading state while sending
   - Display success/error feedback
   - Handle backend communication
   - Close modal on completion

## Customization

### Styling

The component uses a comprehensive StyleSheet that can be customized:

```jsx
// Override specific styles
const customStyles = {
  modal: {
    backgroundColor: "#your-color",
    borderRadius: 20,
    // ... other properties
  }
};
```

### Validation

Add custom trade validation:

```jsx
const validateTrade = (tradeData) => {
  const { myItem, theirItem } = tradeData;
  
  // Custom validation logic
  if (myItem.rarity !== theirItem.rarity) {
    Alert.alert('Rarity Mismatch', 'Items must be same rarity');
    return false;
  }
  
  return true;
};
```

## Dependencies

- React Native core components
- @expo/vector-icons (FontAwesome5, MaterialIcons)
- React Hooks (useState, useEffect)

## Performance

- Optimized FlatList rendering for large inventories
- Efficient image loading with placeholder URLs
- Minimal re-renders with proper state management
- Smooth animations without blocking UI

## Accessibility

- Proper accessibility labels for screen readers
- Keyboard navigation support
- High contrast colors for visibility
- Touch target sizes meet guidelines

## Testing

The component includes comprehensive mock data for testing:

```jsx
// Test with different user configurations
const testUsers = {
  richUser: { hubbaBucks: 500, inventory: legendaryItems },
  newUser: { hubbaBucks: 10, inventory: commonItems },
  emptyUser: { hubbaBucks: 0, inventory: [] }
};
```

## Future Enhancements

- **Bulk trading** for multiple items
- **Trade history** and tracking
- **Trade marketplace** for public offers
- **Automated fair trade suggestions**
- **Trade chat** for negotiations
- **Trade insurance** with Hubba Bucks
- **Seasonal trade events** and bonuses

---

This TradeModal component provides a complete foundation for gear trading in the SkateHubba ecosystem, with room for extensive customization and enhancement based on your specific needs.
