/// <reference types="cypress" />
/// <reference types="cypress/globals" />

/**
 * Buttons & Routing E2E Tests
 *
 * Verifies that all navigation buttons route to the correct pages
 * and that route guards (auth, admin) redirect properly.
 */

// Helper: visit a page with the e2eAuthBypass flag set
function visitAuthenticated(path: string) {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.sessionStorage.setItem("e2eAuthBypass", "true");
    },
  });
}

describe("Public page routing", () => {
  it("landing page loads at /landing", () => {
    cy.visit("/landing");
    cy.location("pathname").should("eq", "/landing");
  });

  it("Sign In button on public nav routes to /auth", () => {
    cy.visit("/landing");
    cy.get('[data-testid="button-public-nav-signin"]').should("be.visible").click();
    cy.location("pathname").should("eq", "/auth");
  });

  it("primary CTA on landing routes to /auth", () => {
    cy.visit("/landing");
    cy.get('[data-testid="cta-landing-primary"]').should("be.visible").click();
    cy.location("pathname").should("eq", "/auth");
  });

  it("secondary CTA on landing routes to /specs", () => {
    cy.visit("/landing");
    cy.get('[data-testid="cta-landing-secondary"]').should("be.visible").click();
    cy.location("pathname").should("eq", "/specs");
  });

  it("/privacy and /terms load without redirect", () => {
    cy.visit("/privacy");
    cy.location("pathname").should("eq", "/privacy");

    cy.visit("/terms");
    cy.location("pathname").should("eq", "/terms");
  });

  it("unauthenticated root (/) redirects to /auth", () => {
    cy.visit("/");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/auth");
  });
});

describe("Auth page routing", () => {
  it("/auth loads and shows sign-up form", () => {
    cy.visit("/auth");
    cy.location("pathname").should("eq", "/auth");
    cy.contains("Sign Up").should("be.visible");
  });

  it("/signin loads the sign-in view", () => {
    cy.visit("/signin");
    cy.location("pathname").should("eq", "/signin");
  });

  it("/signup loads the sign-up view", () => {
    cy.visit("/signup");
    cy.location("pathname").should("eq", "/signup");
  });

  it("/forgot-password loads the password reset view", () => {
    cy.visit("/forgot-password");
    cy.location("pathname").should("eq", "/forgot-password");
  });
});

describe("Dashboard nav buttons routing (authenticated)", () => {
  beforeEach(() => {
    // Start from the hub with auth bypass
    visitAuthenticated("/hub");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/hub");
  });

  it("Home nav button routes to /hub", () => {
    // Navigate away first, then back
    visitAuthenticated("/map");
    cy.location("pathname").should("eq", "/map");

    cy.get('[data-testid="nav-home"]').first().click();
    cy.location("pathname").should("eq", "/hub");
  });

  it("Map nav button routes to /map", () => {
    cy.get('[data-testid="nav-map"]').first().click();
    cy.location("pathname").should("eq", "/map");
  });

  it("Ranks nav button routes to /leaderboard", () => {
    cy.get('[data-testid="nav-ranks"]').first().click();
    cy.location("pathname").should("eq", "/leaderboard");
  });

  it("Profile nav button routes to /me", () => {
    cy.get('[data-testid="nav-profile"]').first().click();
    cy.location("pathname").should("eq", "/me");
  });
});

describe("Protected routes redirect unauthenticated users", () => {
  const protectedPaths = ["/hub", "/map", "/play", "/leaderboard", "/me"];

  protectedPaths.forEach((path) => {
    it(`${path} redirects to login when not authenticated`, () => {
      cy.visit(path);
      // Should redirect away from the protected page
      cy.location("pathname", { timeout: 10000 }).should("not.eq", path);
    });
  });
});

describe("Legacy route redirects (authenticated)", () => {
  const legacyMappings: Array<{ from: string; expectedComponent: string }> = [
    { from: "/home", expectedComponent: "/home" },
    { from: "/feed", expectedComponent: "/feed" },
    { from: "/dashboard", expectedComponent: "/dashboard" },
    { from: "/game", expectedComponent: "/game" },
    { from: "/skate-game", expectedComponent: "/skate-game" },
  ];

  legacyMappings.forEach(({ from, expectedComponent }) => {
    it(`${from} loads without error`, () => {
      visitAuthenticated(from);
      // Legacy routes should load (they render the same components as new routes)
      cy.location("pathname").should("eq", expectedComponent);
      // Page should render content, not a blank screen or error
      cy.get("body").should("not.be.empty");
    });
  });
});

describe("Profile setup flow", () => {
  it("/profile/setup is accessible with auth bypass", () => {
    visitAuthenticated("/profile/setup");
    cy.location("pathname").should("eq", "/profile/setup");
    cy.get('[data-testid="profile-username"]').should("be.visible");
  });
});
