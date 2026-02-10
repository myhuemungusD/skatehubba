export interface UserModeration {
  userId: string;
  isBanned: boolean;
  banExpiresAt: string | null;
  reputationScore: number;
  proVerificationStatus: string;
  isProVerified: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  accountTier: string;
  trustLevel: number;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  moderation: UserModeration | null;
}

export interface UsersResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}
