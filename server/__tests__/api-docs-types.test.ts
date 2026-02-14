import "../api-docs/types";
import type { APIEndpoint, APICategory } from "../api-docs/types";

describe("API Documentation Types", () => {
  it("allows constructing an APIEndpoint", () => {
    const endpoint: APIEndpoint = {
      method: "GET",
      path: "/api/games",
      description: "List all games",
      authentication: "Bearer token",
      parameters: [
        {
          name: "status",
          type: "string",
          location: "query",
          required: false,
          description: "Filter by game status",
        },
      ],
      responses: [
        {
          status: 200,
          description: "Successful response",
          example: { games: [] },
        },
      ],
      notes: ["Paginated results"],
    };
    expect(endpoint.method).toBe("GET");
    expect(endpoint.parameters).toHaveLength(1);
    expect(endpoint.responses[0].status).toBe(200);
  });

  it("allows constructing an APICategory", () => {
    const category: APICategory = {
      name: "Games",
      description: "S.K.A.T.E. game management",
      endpoints: [],
    };
    expect(category.name).toBe("Games");
    expect(category.endpoints).toHaveLength(0);
  });
});
