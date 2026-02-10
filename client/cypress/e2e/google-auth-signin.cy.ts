/// <reference types="cypress" />
/// <reference types="cypress/globals" />

/**
 * Google Auth Sign-In UI Flow E2E Tests
 *
 * Verifies that the Google sign-in button renders correctly across
 * all auth entry points and that the full UI flow from landing
 * through sign-in is navigable.
 */

describe("Google Auth Sign-In UI Flow", () => {
  describe("Auth page (/auth) - Google sign-in button", () => {
    it("renders Google sign-in button on sign-up tab (default)", () => {
      cy.visit("/auth");
      cy.location("pathname").should("eq", "/auth");
      cy.get('[data-testid="button-google-signin"]')
        .should("be.visible")
        .and("not.be.disabled")
        .and("contain", "Continue with Google");
    });

    it("renders Google sign-in button on sign-in tab", () => {
      cy.visit("/auth?tab=signin");
      cy.contains("Sign In").click();
      cy.get('[data-testid="button-google-signin"]')
        .should("be.visible")
        .and("not.be.disabled")
        .and("contain", "Continue with Google");
    });

    it("shows divider text before Google button", () => {
      cy.visit("/auth");
      cy.contains("Or continue with").should("be.visible");
    });
  });

  describe("Standalone sign-in page (/signin)", () => {
    it("renders Google sign-in button", () => {
      cy.visit("/signin");
      cy.location("pathname").should("eq", "/signin");
      cy.get('[data-testid="button-signin-google"]')
        .should("be.visible")
        .and("not.be.disabled")
        .and("contain", "Sign in with Google");
    });

    it("shows email form alongside Google sign-in", () => {
      cy.visit("/signin");
      cy.get('[data-testid="input-signin-email"]').should("be.visible");
      cy.get('[data-testid="input-signin-password"]').should("be.visible");
      cy.get('[data-testid="button-signin-submit"]').should("be.visible");
      cy.get('[data-testid="button-signin-google"]').should("be.visible");
    });
  });

  describe("Standalone sign-up page (/signup)", () => {
    it("renders Google sign-up button", () => {
      cy.visit("/signup");
      cy.location("pathname").should("eq", "/signup");
      cy.get('[data-testid="button-signup-google"]')
        .should("be.visible")
        .and("contain", "Sign up with Google");
    });
  });

  describe("Full landing-to-auth navigation flow", () => {
    it("navigates from landing page to auth page with Google button", () => {
      cy.visit("/landing");
      cy.location("pathname").should("eq", "/landing");

      // Click primary CTA to navigate to auth
      cy.get('[data-testid="cta-landing-primary"]').should("be.visible").click();
      cy.location("pathname").should("eq", "/auth");

      // Default tab (sign-up) shows Google button
      cy.get('[data-testid="button-google-signin"]').should("be.visible").and("not.be.disabled");

      // Switch to sign-in tab, Google button still present
      cy.contains("Sign In").click();
      cy.get('[data-testid="button-google-signin"]').should("be.visible").and("not.be.disabled");
    });

    it("navigates from public nav sign-in button to auth page", () => {
      cy.visit("/landing");
      cy.get('[data-testid="button-public-nav-signin"]').should("be.visible").click();
      cy.location("pathname").should("eq", "/auth");
      cy.get('[data-testid="button-google-signin"]').should("be.visible");
    });
  });

  describe("Auth page tab switching preserves Google button", () => {
    it("Google button visible after toggling between sign-in and sign-up tabs", () => {
      cy.visit("/auth");

      // Start on sign-up tab
      cy.get('[data-testid="button-google-signin"]').should("be.visible");

      // Switch to sign-in
      cy.contains("Sign In").click();
      cy.get('[data-testid="button-google-signin"]').should("be.visible");

      // Switch back to sign-up
      cy.contains("Sign Up").click();
      cy.get('[data-testid="button-google-signin"]').should("be.visible");
    });
  });

  describe("Unauthenticated root redirect includes Google sign-in", () => {
    it("root (/) redirects to /auth which has Google sign-in", () => {
      cy.visit("/");
      cy.location("pathname", { timeout: 10000 }).should("eq", "/auth");
      cy.get('[data-testid="button-google-signin"]').should("be.visible");
    });
  });
});
