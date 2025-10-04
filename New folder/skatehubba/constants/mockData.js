// SkateHubba Shop Items - Static data for testing
export const shopItems = [
  {
    id: 'deck-001',
    name: 'Pro Street Deck 8.0"',
    price: 59.99,
    category: 'Decks',
    brand: 'Street Kings',
    image: '/assets/images/deck-street.png',
    inStock: true,
    description: '8.0" professional street skateboard deck with 7-ply maple construction.'
  },
  {
    id: 'wheels-001', 
    name: 'Street Wheels 52mm',
    price: 34.99,
    category: 'Wheels',
    brand: 'Roll Hard',
    image: '/assets/images/wheels-street.png',
    inStock: true,
    description: '52mm street wheels, 99A durometer. Perfect for street skating.'
  },
  {
    id: 'trucks-001',
    name: 'Independent Trucks 8.0"',
    price: 49.99,
    category: 'Trucks',
    brand: 'Independent',
    image: '/assets/images/trucks-indy.png',
    inStock: true,
    description: 'Stage 11 Independent trucks, 8.0" standard. Industry standard quality.'
  },
  {
    id: 'bearings-001',
    name: 'Swiss Bearings ABEC 7',
    price: 24.99,
    category: 'Bearings',
    brand: 'Swiss Precision',
    image: '/assets/images/bearings-swiss.png',
    inStock: true,
    description: 'ABEC 7 rated Swiss bearings for smooth rolling performance.'
  },
  {
    id: 'grip-001',
    name: 'Black Diamond Grip Tape',
    price: 12.99,
    category: 'Grip Tape',
    brand: 'Diamond Supply',
    image: '/assets/images/grip-black.png',
    inStock: true,
    description: 'Premium grip tape with diamond pattern texture for maximum grip.'
  },
  {
    id: 'shoes-001',
    name: 'Skate Shoes Pro Model',
    price: 79.99,
    category: 'Shoes',
    brand: 'Skate Co',
    image: '/assets/images/shoes-pro.png',
    inStock: false,
    description: 'Professional skate shoes with reinforced ollie area and impact protection.'
  }
];

// Mock spot data for Firebase testing
export const mockSpots = [
  {
    id: 'spot-001',
    name: 'Venice Beach Skate Park',
    location: { lat: 33.9850, lng: -118.4695 },
    address: '1800 Ocean Front Walk, Venice, CA 90291',
    difficulty: 'Intermediate',
    features: ['Bowl', 'Street Course', 'Vert Ramp'],
    rating: 4.5,
    checkins: 342,
    lastActivity: new Date().toISOString(),
    photos: ['/assets/images/venice-beach-1.jpg'],
    crowdLevel: 'Moderate'
  },
  {
    id: 'spot-002',
    name: 'LOVE Park (Replica)',
    location: { lat: 39.9543, lng: -75.1651 },
    address: 'JFK Plaza, Philadelphia, PA 19102',
    difficulty: 'Advanced',
    features: ['Ledges', 'Stairs', 'Manual Pads'],
    rating: 4.8,
    checkins: 156,
    lastActivity: new Date().toISOString(),
    photos: ['/assets/images/love-park-1.jpg'],
    crowdLevel: 'Low'
  },
  {
    id: 'spot-003',
    name: 'Local Street Spot',
    location: { lat: 34.0522, lng: -118.2437 },
    address: '123 Skate St, Los Angeles, CA 90210',
    difficulty: 'Beginner',
    features: ['Flat Ground', 'Small Ledge', 'Curb'],
    rating: 3.2,
    checkins: 89,
    lastActivity: new Date().toISOString(),
    photos: ['/assets/images/local-spot-1.jpg'],
    crowdLevel: 'High'
  }
];

// User profile mock data
export const mockUserProfile = {
  uid: 'user-test-123',
  displayName: 'Test Skater',
  email: 'testskater@skatehubba.com',
  avatar: '/assets/images/avatar-default.png',
  xp: 1250,
  level: 8,
  totalCheckins: 45,
  favoritePosts: ['spot-001', 'spot-002'],
  friends: ['user-456', 'user-789'],
  tricksLanded: ['Kickflip', 'Heelflip', '360 Flip', 'Varial Flip'],
  badges: [
    { id: 'first-checkin', name: 'First Check-in', earned: true },
    { id: 'spot-explorer', name: 'Spot Explorer', earned: true },
    { id: 'social-skater', name: 'Social Skater', earned: false }
  ],
  stats: {
    totalSessions: 67,
    averageSessionTime: 45, // minutes
    mostActiveSpot: 'spot-001',
    tricksAttempted: 234,
    tricksLanded: 89,
    successRate: 38
  }
};