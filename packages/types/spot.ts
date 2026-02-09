export interface Spot {
  id: number;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  spotType: string | null;
  tier: "bronze" | "silver" | "gold" | "legendary" | null;
  photoUrl: string | null;
  thumbnailUrl: string | null;
  verified: boolean;
  isActive: boolean;
  checkInCount: number;
  rating: number | null;
  ratingCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckIn {
  id: number;
  userId: string;
  spotId: number;
  timestamp: string;
  expiresAt: string;
}
