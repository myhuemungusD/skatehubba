import { admin } from "./admin";

export const db = admin.firestore();

export const collections = {
  users: "users",
  profiles: "profiles",
  chatMessages: "chat_messages",
  gameSessions: "game_sessions",
  notifications: "notifications",
  activeCheckins: "active_checkins",
  challengeVotes: "challenge_votes",
  leaderboardLive: "leaderboard_live",
} as const;

export type CollectionName = (typeof collections)[keyof typeof collections];
