/// <reference types="cypress" />
/// <reference types="cypress/globals" />

/**
 * Auth Sign-In Flow E2E
 *
 * App-store quality guardrails for the standalone /signin route:
 * - mobile-first rendering baseline
 * - native form validation and request gating
 * - loading-state UX during auth requests
 * - resilient failure UX for email/password and Google sign-in
 * - auth-adjacent route navigation
 */

describe("Auth Sign-In Flow", () => {
  const selectors = {
    emailInput: '[data-testid="input-signin-email"]',
    passwordInput: '[data-testid="input-signin-password"]',
    emailSubmitButton: '[data-testid="button-signin-submit"]',
    googleButton: '[data-testid="button-signin-google"]',
    verifyEmailLink: '[data-testid="link-verify-email"]',
    forgotPasswordLink: '[data-testid="link-forgot-password"]',
    signUpLink: '[data-testid="link-to-signup"]',
    backHomeLink: '[data-testid="link-back-home"]',
  } as const;

  function stubFirebaseAuthFailure(code: "INVALID_LOGIN_CREDENTIALS" | "POPUP_BLOCKED") {
    cy.intercept("POST", "**/identitytoolkit.googleapis.com/**", {
      statusCode: 400,
      body: {
        error: {
          code: 400,
          message: code,
          errors: [{ message: code, domain: "global", reason: "invalid" }],
        },
      },
    }).as("firebaseAuthFailure");
  }

  beforeEach(() => {
    cy.viewport("iphone-x");
    cy.visit("/signin");
    cy.location("pathname").should("eq", "/signin");
  });

  it("renders all core sign-in controls on mobile", () => {
    cy.contains("Sign In").should("be.visible");
    cy.get(selectors.emailInput).should("be.visible");
    cy.get(selectors.passwordInput).should("be.visible");
    cy.get(selectors.emailSubmitButton).should("be.visible").and("contain", "Sign In");
    cy.get(selectors.googleButton).should("be.visible").and("contain", "Sign in with Google");
  });

  it("blocks empty submission with native required validation", () => {
    cy.get(selectors.emailSubmitButton).click();

    cy.get(selectors.emailInput).then(($input) => {
      const emailField = $input[0] as HTMLInputElement;
      expect(emailField.checkValidity()).to.equal(false);
      expect(emailField.validationMessage.length).to.be.greaterThan(0);
    });

    cy.contains("Welcome back!").should("not.exist");
  });

  it("blocks invalid email format before network submission", () => {
    cy.intercept("POST", "**/identitytoolkit.googleapis.com/**").as("firebaseAuthRequest");

    cy.get(selectors.emailInput).type("invalid-email");
    cy.get(selectors.passwordInput).type("password123");
    cy.get(selectors.emailSubmitButton).click();

    cy.get(selectors.emailInput).then(($input) => {
      const emailField = $input[0] as HTMLInputElement;
      expect(emailField.checkValidity()).to.equal(false);
      expect(emailField.validationMessage.length).to.be.greaterThan(0);
    });

    cy.get("@firebaseAuthRequest.all").should("have.length", 0);
  });

  it("shows loading and recovery states when email/password auth fails", () => {
    cy.intercept("POST", "**/identitytoolkit.googleapis.com/**", {
      statusCode: 400,
      delay: 250,
      body: {
        error: {
          code: 400,
          message: "INVALID_LOGIN_CREDENTIALS",
          errors: [{ message: "INVALID_LOGIN_CREDENTIALS", domain: "global", reason: "invalid" }],
        },
      },
    }).as("firebaseAuthFailure");

    cy.get(selectors.emailInput).type("skater@skatehubba.com");
    cy.get(selectors.passwordInput).type("wrong-password");
    cy.get(selectors.emailSubmitButton).click();

    cy.get(selectors.emailSubmitButton).should("be.disabled").and("contain", "Signing In...");
    cy.wait("@firebaseAuthFailure");

    cy.contains("Login failed").should("be.visible");
    cy.contains("Try again or reset your password").should("be.visible");
    cy.get(selectors.emailSubmitButton).should("not.be.disabled").and("contain", "Sign In");
  });

  it("shows resilient error feedback when Google auth fails", () => {
    stubFirebaseAuthFailure("POPUP_BLOCKED");

    cy.get(selectors.googleButton).click();

    cy.wait("@firebaseAuthFailure");
    cy.contains("Google sign-in failed").should("be.visible");
    cy.get(selectors.googleButton).should("not.be.disabled").and("contain", "Sign in with Google");
  });

  it("navigates to auth support routes from sign-in page", () => {
    cy.get(selectors.verifyEmailLink).click();
    cy.location("pathname").should("eq", "/verify");

    cy.visit("/signin");
    cy.get(selectors.forgotPasswordLink).click();
    cy.location("pathname").should("eq", "/forgot-password");

    cy.visit("/signin");
    cy.get(selectors.signUpLink).click();
    cy.location("pathname").should("eq", "/signup");

    cy.visit("/signin");
    cy.get(selectors.backHomeLink).click();
    cy.location("pathname").should("eq", "/");
  });
});
