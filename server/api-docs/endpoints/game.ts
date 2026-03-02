import type { APICategory } from "../types";

export const gameEndpoints: APICategory = {
  name: "S.K.A.T.E. Game",
  description: "Turn-based S.K.A.T.E. game functionality",
  endpoints: [
    {
      method: "POST",
      path: "/api/games/create",
      description: "Challenge an opponent to a S.K.A.T.E. game",
      requestBody: {
        type: "application/json",
        example: {
          opponentId: "user_456",
        },
      },
      responses: [
        {
          status: 201,
          description: "Challenge sent",
          example: {
            game: {
              id: "game_001",
              player1Id: "user_123",
              player1Name: "John",
              player2Id: "user_456",
              player2Name: "Jane",
              status: "pending",
            },
            message: "Challenge sent.",
          },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/games/:id/respond",
      description: "Accept or decline a challenge",
      parameters: [
        {
          name: "id",
          type: "string",
          location: "path",
          required: true,
          description: "Game ID",
        },
      ],
      requestBody: {
        type: "application/json",
        example: { accept: true },
      },
      responses: [
        {
          status: 200,
          description: "Challenge accepted or declined",
          example: {
            game: { id: "game_001", status: "active" },
            message: "Game on.",
          },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/games/:id/turns",
      description: "Submit a trick video (set or response)",
      parameters: [
        {
          name: "id",
          type: "string",
          location: "path",
          required: true,
          description: "Game ID",
        },
      ],
      requestBody: {
        type: "application/json",
        example: {
          trickDescription: "Kickflip",
          videoUrl: "https://storage.example.com/videos/trick.mp4",
          videoDurationMs: 8000,
          thumbnailUrl: "https://storage.example.com/thumbs/trick.jpg",
        },
      },
      responses: [
        {
          status: 201,
          description: "Turn submitted",
          example: {
            turn: { id: 1, gameId: "game_001", turnType: "set" },
            message: "Trick set. Waiting for opponent.",
          },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/games/turns/:turnId/judge",
      description: "Judge a trick as LAND or BAIL",
      parameters: [
        {
          name: "turnId",
          type: "string",
          location: "path",
          required: true,
          description: "Turn ID",
        },
      ],
      requestBody: {
        type: "application/json",
        example: { result: "landed" },
      },
      responses: [
        {
          status: 200,
          description: "Judgment recorded",
          example: {
            game: { id: "game_001", status: "active" },
            turn: { id: 1, result: "landed" },
          },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/games/:id/setter-bail",
      description: "Setter bails on their own trick (takes a letter, roles swap)",
      parameters: [
        {
          name: "id",
          type: "string",
          location: "path",
          required: true,
          description: "Game ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Setter bail processed",
          example: {
            game: { id: "game_001" },
            gameOver: false,
            winnerId: null,
            message: "Setter bailed. Letter earned. Roles swap.",
          },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/games/:id/forfeit",
      description: "Voluntarily forfeit the game",
      parameters: [
        {
          name: "id",
          type: "string",
          location: "path",
          required: true,
          description: "Game ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Game forfeited",
          example: {
            game: { id: "game_001", status: "forfeited" },
            message: "You forfeited.",
          },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/games/:id/dispute",
      description: "File a dispute on a BAIL judgment (max 1 per player per game)",
      parameters: [
        {
          name: "id",
          type: "string",
          location: "path",
          required: true,
          description: "Game ID",
        },
      ],
      requestBody: {
        type: "application/json",
        example: { turnId: 5 },
      },
      responses: [
        {
          status: 201,
          description: "Dispute filed",
          example: {
            dispute: { id: 1, gameId: "game_001" },
            message: "Dispute filed. Awaiting resolution.",
          },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/games/disputes/:disputeId/resolve",
      description: "Admin resolves a dispute (requires admin role)",
      parameters: [
        {
          name: "disputeId",
          type: "string",
          location: "path",
          required: true,
          description: "Dispute ID",
        },
      ],
      requestBody: {
        type: "application/json",
        example: { finalResult: "landed" },
      },
      responses: [
        {
          status: 200,
          description: "Dispute resolved",
          example: {
            dispute: { id: 1 },
            message: "Dispute upheld. BAIL overturned to LAND. Letter removed.",
          },
        },
      ],
    },
    {
      method: "GET",
      path: "/api/games/my-games",
      description: "List the current user's games grouped by status",
      responses: [
        {
          status: 200,
          description: "Games grouped by status",
          example: {
            pendingChallenges: [],
            sentChallenges: [],
            activeGames: [],
            completedGames: [],
            total: 0,
          },
        },
      ],
    },
    {
      method: "GET",
      path: "/api/games/stats/me",
      description: "Get the current user's game statistics",
      responses: [
        {
          status: 200,
          description: "Player stats",
          example: {
            totalGames: 10,
            wins: 7,
            losses: 3,
            winRate: 70,
            currentStreak: 2,
            bestStreak: 5,
            opponentRecords: [],
            topTricks: [],
            recentGames: [],
          },
        },
      ],
    },
    {
      method: "GET",
      path: "/api/games/:id",
      description: "Get game details including turn history and disputes",
      parameters: [
        {
          name: "id",
          type: "string",
          location: "path",
          required: true,
          description: "Game ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Game details with turns and disputes",
          example: {
            game: {
              id: "game_001",
              player1Id: "user_123",
              player2Id: "user_456",
              status: "active",
            },
            turns: [],
            disputes: [],
            isMyTurn: true,
            needsToJudge: false,
            needsToRespond: false,
            pendingTurnId: null,
            canDispute: true,
          },
        },
      ],
    },
  ],
};
