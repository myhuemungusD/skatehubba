import { describe, it, expect } from "vitest";
import { getHesherResponse } from "../hesherResponses";

describe("getHesherResponse", () => {
  describe("greetings", () => {
    it.each(["hey", "hi", "hello", "yo", "sup", "what's up", "howdy"])(
      "responds to greeting: %s",
      (greeting) => {
        const response = getHesherResponse(greeting);
        expect(response).toBeTruthy();
        expect(response).not.toContain("not sure");
      }
    );
  });

  describe("S.K.A.T.E. game", () => {
    it("responds to 'how do I play a skate game'", () => {
      const response = getHesherResponse("how do I play a skate game");
      expect(response).toContain("S.K.A.T.E.");
    });

    it("responds to 'how do I start a SKATE game'", () => {
      const response = getHesherResponse("how do I start a SKATE game");
      expect(response).toContain("S.K.A.T.E.");
    });

    it("responds to 'skate game' keyword", () => {
      const response = getHesherResponse("tell me about the skate game");
      expect(response).toContain("S.K.A.T.E.");
    });

    it("responds to 'skate challenge'", () => {
      const response = getHesherResponse("skate challenge");
      expect(response).toContain("S.K.A.T.E.");
    });
  });

  describe("challenge", () => {
    it("responds to 'how to challenge someone'", () => {
      const response = getHesherResponse("how do I challenge someone?");
      expect(response).toContain("Create Game");
    });
  });

  describe("tricks / filming", () => {
    it("responds to 'trick' keyword", () => {
      const response = getHesherResponse("how do tricks work?");
      expect(response.includes("one-take") || response.includes("one take")).toBe(true);
    });

    it("responds to 'record' keyword", () => {
      const response = getHesherResponse("how do I record my trick");
      expect(response).toBeTruthy();
      expect(response).not.toContain("not sure");
    });
  });

  describe("turn / deadline", () => {
    it("responds to 'deadline' keyword", () => {
      const response = getHesherResponse("what is the deadline?");
      expect(response).toContain("24-hour");
    });

    it("responds to '24 hour' keyword", () => {
      const response = getHesherResponse("is there a 24 hour limit?");
      expect(response).toContain("24-hour");
    });
  });

  describe("forfeit", () => {
    it("responds to 'forfeit'", () => {
      const response = getHesherResponse("can I forfeit?");
      expect(response).toContain("forfeit");
    });
  });

  describe("spots / map", () => {
    it("responds to 'spot' keyword", () => {
      const response = getHesherResponse("where are the spots?");
      expect(response).toContain("Map");
    });

    it("responds to 'skatepark' keyword", () => {
      const response = getHesherResponse("nearest skatepark");
      expect(response).toContain("Map");
    });
  });

  describe("check-in", () => {
    it("responds to 'check in' keyword", () => {
      const response = getHesherResponse("how do I check in?");
      expect(response).toContain("Check In");
    });
  });

  describe("profile / settings", () => {
    it("responds to 'profile' keyword", () => {
      const response = getHesherResponse("how do I edit my profile?");
      expect(response).toContain("Settings");
    });

    it("responds to 'username' keyword", () => {
      const response = getHesherResponse("change my username");
      expect(response).toContain("Settings");
    });
  });

  describe("XP / leaderboard", () => {
    it("responds to 'xp' keyword", () => {
      const response = getHesherResponse("how do I earn xp?");
      expect(response).toContain("XP");
    });

    it("responds to 'leaderboard' keyword", () => {
      const response = getHesherResponse("show me the leaderboard");
      expect(response).toContain("Leaderboard");
    });
  });

  describe("help", () => {
    it("responds to 'help' keyword", () => {
      const response = getHesherResponse("help");
      expect(response).toContain("S.K.A.T.E. games");
    });

    it("responds to 'what can you do'", () => {
      const response = getHesherResponse("what can you do?");
      expect(response).toContain("S.K.A.T.E. games");
    });
  });

  describe("navigation", () => {
    it("responds to 'how do I get to the map'", () => {
      const response = getHesherResponse("how do I get to the map");
      // Should match navigation OR spots — both are valid
      expect(response).toBeTruthy();
      expect(response).not.toContain("not sure");
    });
  });

  describe("thanks and bye", () => {
    it("responds to 'thanks'", () => {
      const response = getHesherResponse("thanks!");
      expect(response).not.toContain("not sure");
    });

    it("responds to 'bye'", () => {
      const response = getHesherResponse("bye");
      expect(response).not.toContain("not sure");
    });
  });

  describe("fallback", () => {
    it("returns fallback for unknown input", () => {
      const response = getHesherResponse("asdfghjkl random gibberish");
      expect(response).toContain("S.K.A.T.E.");
    });

    it("returns prompt for empty input", () => {
      const response = getHesherResponse("");
      expect(response).toContain("Type something");
    });

    it("returns prompt for whitespace-only input", () => {
      const response = getHesherResponse("   ");
      expect(response).toContain("Type something");
    });
  });

  describe("pattern ordering — specific patterns match before broad ones", () => {
    it("'how do I get a trick filmed' matches tricks, not navigation", () => {
      const response = getHesherResponse("how do I get a trick filmed");
      // Should match tricks pattern due to 'trick' and 'film' keywords
      expect(response).not.toContain("main nav");
    });

    it("'where are the skate spots' matches spots, not navigation", () => {
      const response = getHesherResponse("where are the skate spots");
      expect(response).toContain("Map");
    });
  });
});
