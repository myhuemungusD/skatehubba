import type { User as FirebaseUser } from "firebase/auth";

export type UserRole = "admin" | "moderator" | "verified_pro";
export type ProfileStatus = "unknown" | "exists" | "missing";

export type BootStatus = "ok" | "degraded";
export type BootPhase = "starting" | "auth_ready" | "hydrating" | "finalized";

export type Result<T> =
  | { status: "ok"; data: T }
  | { status: "error"; error: string }
  | { status: "timeout"; error: string };

export interface UserProfile {
  uid: string;
  username: string;
  stance: "regular" | "goofy" | null;
  experienceLevel: "beginner" | "intermediate" | "advanced" | "pro" | null;
  favoriteTricks: string[];
  bio: string | null;
  sponsorFlow?: string | null;
  sponsorTeam?: string | null;
  hometownShop?: string | null;
  spotsVisited: number;
  crewName: string | null;
  credibilityScore: number;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileCache {
  status: ProfileStatus;
  profile: UserProfile | null;
}

export interface AuthState {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  profileStatus: ProfileStatus;
  roles: UserRole[];
  loading: boolean;
  bootStatus: BootStatus;
  bootPhase: BootPhase;
  bootDurationMs: number;
  isInitialized: boolean;
  error: Error | null;

  initialize: () => Promise<void>;
  handleRedirectResult: () => Promise<void>;

  signInWithGoogle: () => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshRoles: () => Promise<UserRole[]>;
  hasRole: (role: UserRole) => boolean;
  clearError: () => void;
  setProfile: (profile: UserProfile) => void;
}
