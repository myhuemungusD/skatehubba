import type { APICategory } from "../types";

export const gameEndpoints: APICategory = {
  name: "S.K.A.T.E. Game",
  description: "Remote S.K.A.T.E. game functionality",
  endpoints: [
    {
      method: "GET",
      path: "/api/games",
      description: "Get all games for a user",
      parameters: [
        {
          name: "userId",
          type: "string",
          location: "query",
          required: true,
          description: "User ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "List of games",
          example: [
            {
              gameId: "game_001",
              player1Id: "user_123",
              player1Name: "John",
              player2Id: "user_456",
              player2Name: "Jane",
              status: "active",
              currentTurn: "user_123",
              player1Letters: "SK",
              player2Letters: "S",
            },
          ],
        },
      ],
    },
    {
      method: "POST",
      path: "/api/games/create",
      description: "Create a new game",
      requestBody: {
        type: "application/json",
        example: {
          userId: "user_123",
        },
      },
      responses: [
        {
          status: 201,
          description: "Game created",
          example: {
            gameId: "game_001",
            player1Id: "user_123",
            player1Name: "John",
            status: "waiting",
          },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/games/:gameId/join",
      description: "Join an existing game",
      parameters: [
        {
          name: "gameId",
          type: "string",
          location: "path",
          required: true,
          description: "Game ID",
        },
      ],
      requestBody: {
        type: "application/json",
        example: {
          userId: "user_456",
        },
      },
      responses: [
        {
          status: 200,
          description: "Joined game",
          example: {
            gameId: "game_001",
            player1Id: "user_123",
            player2Id: "user_456",
            status: "active",
          },
        },
        {
          status: 400,
          description: "Cannot join game",
          example: { error: "Game is not available to join" },
        },
      ],
    },
    {
      method: "POST",
      path: "/api/games/:gameId/trick",
      description: "Submit a trick in a game",
      parameters: [
        {
          name: "gameId",
          type: "string",
          location: "path",
          required: true,
          description: "Game ID",
        },
      ],
      requestBody: {
        type: "application/json",
        example: {
          userId: "user_123",
          trick: "Kickflip",
        },
      },
      responses: [
        {
          status: 200,
          description: "Trick submitted",
          example: {
            gameId: "game_001",
            currentTurn: "user_456",
            lastTrick: "Kickflip",
          },
        },
        {
          status: 403,
          description: "Not your turn",
          example: { error: "It's not your turn" },
        },
      ],
    },
    {
      method: "GET",
      path: "/api/games/:gameId",
      description: "Get game details including turn history",
      parameters: [
        {
          name: "gameId",
          type: "string",
          location: "path",
          required: true,
          description: "Game ID",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Game details with turn history",
          example: {
            gameId: "game_001",
            player1Id: "user_123",
            player2Id: "user_456",
            status: "active",
            turns: [
              {
                turnId: 1,
                gameId: "game_001",
                playerId: "user_123",
                trick: "Kickflip",
                createdAt: "2025-11-03T07:00:00.000Z",
              },
            ],
          },
        },
      ],
    },
  ],
};
