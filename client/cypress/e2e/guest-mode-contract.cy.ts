/// <reference types="cypress" />

describe("Guest Mode enforcement", () => {
  before(() => {
    // Optional: sanity check env is wired
    if (Cypress.env("VITE_GUEST_MODE") !== undefined) {
      expect(Cypress.env("VITE_GUEST_MODE")).to.eq(true);
    }
  });

  it("redirects /shop to /map in guest mode", () => {
    cy.visit("/shop");

    cy.location("pathname", { timeout: 10000 }).should("eq", "/map");
  });

  it("cold-starts as a guest and reaches /map without auth UI", () => {
    // Simulate a true cold start
    cy.clearCookies();
    cy.clearLocalStorage();

    cy.visit("/");

    // Must land on map
    cy.location("pathname", { timeout: 10000 }).should("eq", "/map");

    // No login or profile setup UI should exist
    cy.contains(/sign in/i).should("not.exist");
    cy.contains(/log in/i).should("not.exist");
    cy.contains(/create profile/i).should("not.exist");

    // Map UI sanity check (pick something stable in your map page)
    // Example: map container, canvas, or heading
    cy.get("[data-testid=map-root]", { timeout: 10000 }).should("exist");
  });

  it("can reach /skate-game in guest mode", () => {
    cy.visit("/skate-game");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/skate-game");
    // Optionally, check for SKATE UI marker
    // cy.contains("SKATE");
  });
});
