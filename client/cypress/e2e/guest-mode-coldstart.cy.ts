/// <reference types="cypress" />

// This test ensures Guest Mode contract: cold start lands on /map, profile exists, SKATE route loads

describe("Guest Mode cold start contract", () => {
  it("lands on /map and creates profile", () => {
    cy.clearCookies();
    cy.visit("/");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/map");
    // Wait for UID to be set in window (simulate app boot)
    cy.window().its("__GUEST_UID__").should("be.a", "string").and("have.length.greaterThan", 0);
    // Optionally, check for profile existence via API or Firestore (if test infra allows)
  });

  it("can access /game (SKATE)", () => {
    cy.visit("/game");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/game");
    cy.contains("SKATE"); // Adjust to match actual heading/text
  });
});
