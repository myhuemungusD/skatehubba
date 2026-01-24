/// <reference types="cypress" />
/// <reference types="cypress/globals" />

describe("Profile onboarding", () => {
  it("redirects unauthenticated users to login", () => {
    cy.visit("/profile/setup");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/login");
  });

  it("blocks dashboard for unauthenticated users", () => {
    cy.visit("/dashboard");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/login");
  });

  it("allows authenticated users to access profile setup", () => {
    cy.login(); // assumes cy.login() custom command exists
    cy.visit("/profile/setup");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/profile/setup");
    cy.contains("Profile Setup"); // adjust to match actual heading/text
  });

  it("completes onboarding and redirects to dashboard", () => {
    cy.login();
    cy.visit("/profile/setup");
    // Fill out onboarding form (adjust selectors as needed)
    cy.get('[data-testid="onboarding-username"]').type("testuser");
    cy.get('[data-testid="onboarding-submit"]').click();
    cy.location("pathname", { timeout: 10000 }).should("eq", "/dashboard");
    cy.contains("Welcome"); // adjust to match dashboard welcome text
  });

  it("prevents dashboard access until onboarding is complete", () => {
    cy.login({ onboardingIncomplete: true }); // assumes custom login variant
    cy.visit("/dashboard");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/profile/setup");
  });
});
