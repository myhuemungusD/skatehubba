describe("Profile onboarding", () => {
  it("redirects unauthenticated users to login", () => {
    cy.visit("/profile/setup");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/login");
  });

  it("blocks dashboard for unauthenticated users", () => {
    cy.visit("/dashboard");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/login");
  });
});
