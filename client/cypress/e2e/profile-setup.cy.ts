describe("Profile onboarding", () => {
  it("redirects unauthenticated users to auth", () => {
    cy.visit("/profile/setup");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/auth");
  });

  it("blocks dashboard for unauthenticated users", () => {
    cy.visit("/dashboard");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/auth");
  });
});
