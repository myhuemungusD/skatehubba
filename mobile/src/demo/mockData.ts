/**
 * Mock data for investor demo screens.
 * All data is hardcoded so demos work without backend connectivity.
 */

import type { SkateLetter } from "@/types";

interface DemoPlayer {
  uid: string;
  displayName: string;
  photoURL: string | null;
  email: string;
  totalPoints: number;
  spotsUnlocked: number;
  currentStreak: number;
  gamesWon: number;
  gamesLost: number;
  gamesPlayed: number;
}

// ─── Players ───────────────────────────────────────────────
export const DEMO_PLAYERS: {
  me: DemoPlayer;
  opponent: DemoPlayer;
} = {
  me: {
    uid: "demo-player-1",
    displayName: "Tony Hawk",
    photoURL: null,
    email: "tony@skatehubba.com",
    totalPoints: 12_850,
    spotsUnlocked: 47,
    currentStreak: 14,
    gamesWon: 23,
    gamesLost: 5,
    gamesPlayed: 28,
  },
  opponent: {
    uid: "demo-player-2",
    displayName: "Nyjah Huston",
    photoURL: null,
    email: "nyjah@skatehubba.com",
    totalPoints: 11_200,
    spotsUnlocked: 39,
    currentStreak: 8,
    gamesWon: 19,
    gamesLost: 7,
    gamesPlayed: 26,
  },
};

// ─── Active Battle (mid-game) ──────────────────────────────
export const DEMO_ACTIVE_GAME = {
  id: "demo-game-active",
  player1Id: DEMO_PLAYERS.me.uid,
  player2Id: DEMO_PLAYERS.opponent.uid,
  player1DisplayName: DEMO_PLAYERS.me.displayName,
  player2DisplayName: DEMO_PLAYERS.opponent.displayName,
  status: "active" as const,
  player1Letters: ["S", "K"] as SkateLetter[],
  player2Letters: ["S", "K", "A"] as SkateLetter[],
  currentAttacker: DEMO_PLAYERS.me.uid,
  currentTurn: DEMO_PLAYERS.me.uid,
  turnPhase: "attacker_recording" as const,
  roundNumber: 6,
  winnerId: null,
  createdAt: new Date(Date.now() - 3600000 * 2),
  completedAt: null,
  currentSetMove: null,
  moves: [
    {
      id: "move-1",
      playerId: DEMO_PLAYERS.me.uid,
      type: "set" as const,
      trickName: "Kickflip",
      clipUrl: "",
      roundNumber: 1,
      result: "landed" as const,
    },
    {
      id: "move-2",
      playerId: DEMO_PLAYERS.opponent.uid,
      type: "match" as const,
      trickName: "Kickflip",
      clipUrl: "",
      roundNumber: 1,
      result: "landed" as const,
      judgmentVotes: { attackerVote: "landed", defenderVote: "landed" },
    },
    {
      id: "move-3",
      playerId: DEMO_PLAYERS.opponent.uid,
      type: "set" as const,
      trickName: "Tre Flip",
      clipUrl: "",
      roundNumber: 2,
      result: "landed" as const,
    },
    {
      id: "move-4",
      playerId: DEMO_PLAYERS.me.uid,
      type: "match" as const,
      trickName: "Tre Flip",
      clipUrl: "",
      roundNumber: 2,
      result: "bailed" as const,
      judgmentVotes: { attackerVote: "bailed", defenderVote: "bailed" },
    },
    {
      id: "move-5",
      playerId: DEMO_PLAYERS.opponent.uid,
      type: "set" as const,
      trickName: "Heelflip",
      clipUrl: "",
      roundNumber: 3,
      result: "landed" as const,
    },
    {
      id: "move-6",
      playerId: DEMO_PLAYERS.me.uid,
      type: "match" as const,
      trickName: "Heelflip",
      clipUrl: "",
      roundNumber: 3,
      result: "bailed" as const,
      judgmentVotes: { attackerVote: "bailed", defenderVote: "bailed" },
    },
    {
      id: "move-7",
      playerId: DEMO_PLAYERS.me.uid,
      type: "set" as const,
      trickName: "Hardflip",
      clipUrl: "",
      roundNumber: 4,
      result: "landed" as const,
    },
    {
      id: "move-8",
      playerId: DEMO_PLAYERS.opponent.uid,
      type: "match" as const,
      trickName: "Hardflip",
      clipUrl: "",
      roundNumber: 4,
      result: "bailed" as const,
      judgmentVotes: { attackerVote: "bailed", defenderVote: "bailed" },
    },
    {
      id: "move-9",
      playerId: DEMO_PLAYERS.me.uid,
      type: "set" as const,
      trickName: "Varial Kickflip",
      clipUrl: "",
      roundNumber: 5,
      result: "landed" as const,
    },
    {
      id: "move-10",
      playerId: DEMO_PLAYERS.opponent.uid,
      type: "match" as const,
      trickName: "Varial Kickflip",
      clipUrl: "",
      roundNumber: 5,
      result: "bailed" as const,
      judgmentVotes: { attackerVote: "bailed", defenderVote: "bailed" },
    },
  ],
};

// ─── Completed Game (victory) ──────────────────────────────
export const DEMO_COMPLETED_GAME = {
  ...DEMO_ACTIVE_GAME,
  id: "demo-game-completed",
  status: "completed" as const,
  player1Letters: ["S", "K"] as SkateLetter[],
  player2Letters: ["S", "K", "A", "T", "E"] as SkateLetter[],
  winnerId: DEMO_PLAYERS.me.uid,
  roundNumber: 8,
  completedAt: new Date(Date.now() - 1800000),
  moves: [
    ...DEMO_ACTIVE_GAME.moves,
    {
      id: "move-11",
      playerId: DEMO_PLAYERS.me.uid,
      type: "set" as const,
      trickName: "Nollie Heelflip",
      clipUrl: "",
      roundNumber: 6,
      result: "landed" as const,
    },
    {
      id: "move-12",
      playerId: DEMO_PLAYERS.opponent.uid,
      type: "match" as const,
      trickName: "Nollie Heelflip",
      clipUrl: "",
      roundNumber: 6,
      result: "bailed" as const,
      judgmentVotes: { attackerVote: "bailed", defenderVote: "bailed" },
    },
    {
      id: "move-13",
      playerId: DEMO_PLAYERS.me.uid,
      type: "set" as const,
      trickName: "360 Flip",
      clipUrl: "",
      roundNumber: 7,
      result: "landed" as const,
    },
    {
      id: "move-14",
      playerId: DEMO_PLAYERS.opponent.uid,
      type: "match" as const,
      trickName: "360 Flip",
      clipUrl: "",
      roundNumber: 7,
      result: "bailed" as const,
      judgmentVotes: { attackerVote: "bailed", defenderVote: "bailed" },
    },
  ],
};

// ─── Judging Phase (for vote screen) ────────────────────────
export const DEMO_JUDGING_GAME = {
  ...DEMO_ACTIVE_GAME,
  id: "demo-game-judging",
  turnPhase: "judging" as const,
  currentTurn: DEMO_PLAYERS.me.uid,
  currentAttacker: DEMO_PLAYERS.me.uid,
  currentSetMove: {
    trickName: "Laser Flip",
    clipUrl: "",
  },
  moves: [
    ...DEMO_ACTIVE_GAME.moves,
    {
      id: "move-pending",
      playerId: DEMO_PLAYERS.opponent.uid,
      type: "match" as const,
      trickName: "Laser Flip",
      clipUrl: "",
      roundNumber: 6,
      result: "pending" as const,
      judgmentVotes: { attackerVote: null, defenderVote: null },
    },
  ],
};

// ─── Challenge List ────────────────────────────────────────
export const DEMO_CHALLENGES = [
  {
    id: "challenge-1",
    createdBy: DEMO_PLAYERS.me.uid,
    opponent: DEMO_PLAYERS.opponent.uid,
    opponentName: "Nyjah Huston",
    participants: [DEMO_PLAYERS.me.uid, DEMO_PLAYERS.opponent.uid],
    status: "accepted" as const,
    deadline: new Date(Date.now() + 86400000),
    createdAt: new Date(Date.now() - 3600000),
    myLetters: ["S", "K"] as SkateLetter[],
    opponentLetters: ["S", "K", "A"] as SkateLetter[],
    turnPhase: "attacker_recording",
    isMyTurn: true,
  },
  {
    id: "challenge-2",
    createdBy: "demo-player-3",
    opponent: DEMO_PLAYERS.me.uid,
    opponentName: "Rodney Mullen",
    participants: ["demo-player-3", DEMO_PLAYERS.me.uid],
    status: "pending" as const,
    deadline: new Date(Date.now() + 172800000),
    createdAt: new Date(Date.now() - 7200000),
    myLetters: [] as SkateLetter[],
    opponentLetters: [] as SkateLetter[],
    turnPhase: null,
    isMyTurn: false,
  },
  {
    id: "challenge-3",
    createdBy: DEMO_PLAYERS.me.uid,
    opponent: "demo-player-4",
    opponentName: "Leticia Bufoni",
    participants: [DEMO_PLAYERS.me.uid, "demo-player-4"],
    status: "accepted" as const,
    deadline: new Date(Date.now() + 43200000),
    createdAt: new Date(Date.now() - 14400000),
    myLetters: ["S"] as SkateLetter[],
    opponentLetters: ["S", "K", "A", "T"] as SkateLetter[],
    turnPhase: "defender_recording",
    isMyTurn: false,
  },
  {
    id: "challenge-4",
    createdBy: "demo-player-5",
    opponent: DEMO_PLAYERS.me.uid,
    opponentName: "Yuto Horigome",
    participants: ["demo-player-5", DEMO_PLAYERS.me.uid],
    status: "completed" as const,
    deadline: new Date(Date.now() - 86400000),
    createdAt: new Date(Date.now() - 259200000),
    myLetters: ["S", "K", "A", "T", "E"] as SkateLetter[],
    opponentLetters: ["S", "K"] as SkateLetter[],
    turnPhase: null,
    isMyTurn: false,
  },
];

// ─── Leaderboard ───────────────────────────────────────────
export const DEMO_LEADERBOARD = [
  {
    userId: DEMO_PLAYERS.me.uid,
    displayName: "Tony Hawk",
    photoURL: null,
    rank: 1,
    wins: 23,
    losses: 5,
    winRate: 82,
  },
  {
    userId: DEMO_PLAYERS.opponent.uid,
    displayName: "Nyjah Huston",
    photoURL: null,
    rank: 2,
    wins: 19,
    losses: 7,
    winRate: 73,
  },
  {
    userId: "demo-player-3",
    displayName: "Rodney Mullen",
    photoURL: null,
    rank: 3,
    wins: 17,
    losses: 6,
    winRate: 74,
  },
  {
    userId: "demo-player-4",
    displayName: "Leticia Bufoni",
    photoURL: null,
    rank: 4,
    wins: 15,
    losses: 9,
    winRate: 63,
  },
  {
    userId: "demo-player-5",
    displayName: "Yuto Horigome",
    photoURL: null,
    rank: 5,
    wins: 14,
    losses: 8,
    winRate: 64,
  },
  {
    userId: "demo-player-6",
    displayName: "Rayssa Leal",
    photoURL: null,
    rank: 6,
    wins: 13,
    losses: 10,
    winRate: 57,
  },
  {
    userId: "demo-player-7",
    displayName: "Chris Joslin",
    photoURL: null,
    rank: 7,
    wins: 11,
    losses: 7,
    winRate: 61,
  },
  {
    userId: "demo-player-8",
    displayName: "Jagger Eaton",
    photoURL: null,
    rank: 8,
    wins: 10,
    losses: 12,
    winRate: 45,
  },
];

// ─── Spots (for map demo) ──────────────────────────────────
export const DEMO_SPOTS = [
  {
    id: "spot-1",
    name: "Hubba Hideout",
    description: "Classic SF ledge spot, home of the famous hubba",
    lat: 37.7849,
    lng: -122.4094,
    tier: "legendary" as const,
  },
  {
    id: "spot-2",
    name: "LOVE Park",
    description: "Philly's most iconic skate plaza",
    lat: 39.9543,
    lng: -75.1638,
    tier: "gold" as const,
  },
  {
    id: "spot-3",
    name: "Stoner Plaza",
    description: "West LA ledge paradise with perfect marble",
    lat: 34.0350,
    lng: -118.4640,
    tier: "gold" as const,
  },
  {
    id: "spot-4",
    name: "FDR Skatepark",
    description: "DIY concrete bowl under a highway bridge",
    lat: 39.9263,
    lng: -75.1830,
    tier: "silver" as const,
  },
  {
    id: "spot-5",
    name: "El Toro High School",
    description: "Famous 20-stair set",
    lat: 33.6345,
    lng: -117.6752,
    tier: "legendary" as const,
  },
];
