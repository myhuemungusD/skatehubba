/** Spot type matching backend schema */
export interface MockSpot {
  id: number;
  name: string;
  lat: number;
  lng: number;
  spotType: "street" | "park" | "diy";
  tier: "bronze" | "silver" | "gold";
  description: string;
  photoUrl: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** Performance measurement result */
export interface PerformanceMetrics {
  loadTimeMs: number;
  markerCount: number;
  memoryUsageMB?: number;
}
