import type { InsertUser, Spot, InsertSpot } from "@shared/schema";

export type StoredUser = InsertUser & {
  id: number;
  createdAt: Date;
};

export interface IStorage {
  getUser(id: number): Promise<StoredUser | undefined>;
  getUserByUsername(username: string): Promise<StoredUser | undefined>;
  createUser(user: InsertUser): Promise<StoredUser>;
  // The Spot methods must match exactly
  createSpot(spot: InsertSpot & { createdBy: number }): Promise<Spot>;
  getAllSpots(): Promise<Spot[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, StoredUser>;
  private spots: Map<number, Spot>;
  private currentUserId: number;
  private currentSpotId: number;

  constructor() {
    this.users = new Map();
    this.spots = new Map();
    this.currentUserId = 1;
    this.currentSpotId = 1;
  }

  async getUser(id: number): Promise<StoredUser | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<StoredUser | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<StoredUser> {
    const id = this.currentUserId++;
    const user: StoredUser = { ...insertUser, id, createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  async createSpot(insertSpot: InsertSpot & { createdBy: number }): Promise<Spot> {
    const id = this.currentSpotId++;
    const spot: Spot = {
      ...insertSpot,
      id,
      createdBy: insertSpot.createdBy,
      verified: false,
      createdAt: new Date(),
    };
    this.spots.set(id, spot);
    return spot;
  }

  async getAllSpots(): Promise<Spot[]> {
    return Array.from(this.spots.values());
  }
}

export const storage = new MemStorage();
