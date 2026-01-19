import type { Timestamp } from "firebase/firestore";

export interface BetaSignup {
  email: string;
  platform: "ios" | "android";
  createdAt: Timestamp;
  lastSubmittedAt?: Timestamp;
  submitCount?: number;
  ipHash?: string;
}
