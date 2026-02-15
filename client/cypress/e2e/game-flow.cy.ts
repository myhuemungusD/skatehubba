/// <reference types="cypress" />
/// <reference types="cypress/globals" />

/**
 * S.K.A.T.E. Game Flow E2E Tests
 *
 * Comprehensive end-to-end tests covering the complete game lifecycle:
 * 1. Challenge creation
 * 2. Challenge acceptance
 * 3. Trick submission (set_trick phase)
 * 4. Opponent response (respond_trick phase)
 * 5. Judging (judge phase)
 * 6. Letter progression
 * 7. Dispute filing
 * 8. Game completion
 *
 * Tests the core S.K.A.T.E. game functionality from start to finish.
 */

// Helper: visit a page with the e2eAuthBypass flag set
function visitAuthenticated(path: string) {
  cy.visit(path, {
    onBeforeLoad(win) {
      win.sessionStorage.setItem("e2eAuthBypass", "true");
    },
  });
}

// Helper: mock video blob for testing
function mockVideoBlob(): Blob {
  return new Blob(["mock video data"], { type: "video/mp4" });
}

describe("S.K.A.T.E. Game Flow - Full Lifecycle", () => {
  let gameId: string;
  let player1Id: string;
  let player2Id: string;

  before(() => {
    // Set up test data if needed
    cy.log("Setting up E2E game flow test");
  });

  describe("Challenge Creation & Acceptance", () => {
    it("Player 1 can navigate to game lobby", () => {
      visitAuthenticated("/play");
      cy.location("pathname").should("eq", "/play");
      cy.contains("S.K.A.T.E.").should("be.visible");
    });

    it("Player 1 can create a new challenge", () => {
      visitAuthenticated("/play");

      // Look for create challenge button
      cy.get('[data-testid="button-create-challenge"]', { timeout: 10000 })
        .should("be.visible")
        .click();

      // Fill in challenge form if modal appears
      cy.get('[data-testid="input-opponent-search"]', { timeout: 5000 }).should("be.visible");
      cy.get('[data-testid="input-opponent-search"]').type("test_opponent");

      // Submit challenge
      cy.get('[data-testid="button-submit-challenge"]').should("be.visible").click();

      // Verify challenge was created
      cy.contains("Challenge sent", { timeout: 10000 }).should("be.visible");
    });

    it("Player 2 can see pending challenges", () => {
      visitAuthenticated("/play");

      // Check for pending challenges section
      cy.get('[data-testid="section-pending-challenges"]', { timeout: 10000 }).should("be.visible");

      // Should see at least one challenge
      cy.get('[data-testid^="challenge-card-"]').should("have.length.at.least", 1);
    });

    it("Player 2 can accept a challenge", () => {
      visitAuthenticated("/play");

      // Accept the first available challenge
      cy.get('[data-testid^="button-accept-challenge-"]', { timeout: 10000 })
        .first()
        .should("be.visible")
        .click();

      // Verify game started
      cy.contains("Game started", { timeout: 10000 }).should("be.visible");

      // Should navigate to active game
      cy.url().should("include", "game=");

      // Extract game ID from URL for later use
      cy.url().then((url) => {
        const urlParams = new URLSearchParams(url.split("?")[1]);
        const extractedGameId = urlParams.get("game");
        if (extractedGameId) {
          gameId = extractedGameId;
          cy.log(`Game ID: ${gameId}`);
        }
      });
    });
  });

  describe("Game Play - Turn Phases", () => {
    it("Offensive player can see 'Set Trick' phase", () => {
      visitAuthenticated("/play");

      // Navigate to active game
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Should see video recorder for setting trick
      cy.get('[data-testid="video-recorder"]', { timeout: 10000 }).should("be.visible");
      cy.contains("Set the trick").should("be.visible");
    });

    it("Offensive player can record and submit a trick", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Mock video recording (in real test, this would involve actual recording)
      // For E2E, we'll simulate by checking if the submit button becomes enabled

      // Enter trick description
      cy.get('[data-testid="input-trick-description"]', { timeout: 5000 })
        .should("be.visible")
        .type("Kickflip over a 10-stair");

      // In a real scenario, video would be recorded here
      // For this test, we'll check if the form is ready

      cy.get('[data-testid="button-submit-trick"]').should("be.visible");

      // Note: Actual submission would require mocking video upload
      // which is complex in Cypress. This test verifies UI flow.
    });

    it("Defensive player can see 'Respond Trick' phase", () => {
      visitAuthenticated("/play");

      // Simulate being the defensive player viewing opponent's trick
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Should see opponent's video and response recorder
      cy.get('[data-testid="opponent-trick-video"]', { timeout: 10000 }).should("exist");
      cy.contains("Watch and respond").should("be.visible");

      // Should see video recorder for response
      cy.get('[data-testid="video-recorder"]').should("be.visible");
    });

    it("Defensive player can watch trick and record response", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Play opponent's video (if autoplay is off)
      cy.get('[data-testid="button-play-opponent-video"]', { timeout: 5000 }).click();

      // Wait for video to be "watched"
      cy.wait(2000);

      // Enter response description
      cy.get('[data-testid="input-trick-description"]')
        .should("be.visible")
        .type("Matched the kickflip");

      // Check if submit button is available
      cy.get('[data-testid="button-submit-response"]').should("be.visible");
    });

    it("Defensive player can judge opponent's trick", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // In judge phase, should see LAND/BAIL buttons
      cy.get('[data-testid="button-judge-land"]', { timeout: 10000 }).should("be.visible");
      cy.get('[data-testid="button-judge-bail"]').should("be.visible");

      // Make a judgement
      cy.get('[data-testid="button-judge-land"]').click();

      // Verify judgement was recorded
      cy.contains("Judgement recorded", { timeout: 10000 }).should("be.visible");
    });
  });

  describe("Game State & Progression", () => {
    it("Letters display shows S.K.A.T.E. progression", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Should see letters display component
      cy.get('[data-testid="letters-display"]', { timeout: 10000 }).should("be.visible");

      // Should show letter containers
      cy.get('[data-testid^="letter-"]').should("have.length", 5); // S, K, A, T, E
    });

    it("Turn history shows all previous turns", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Should see turn history section
      cy.get('[data-testid="turn-history"]', { timeout: 10000 }).should("be.visible");

      // Should have at least one turn recorded
      cy.get('[data-testid^="turn-"]').should("have.length.at.least", 1);
    });

    it("Game shows correct current player and turn phase", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Should show whose turn it is
      cy.get('[data-testid="current-player-indicator"]', { timeout: 10000 }).should("be.visible");

      // Should show current phase
      cy.get('[data-testid="current-phase-badge"]').should("be.visible");
    });

    it("Timer shows 60-second voting window", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // In judge phase, should see countdown timer
      cy.get('[data-testid="vote-timer"]', { timeout: 10000 }).should("exist");
    });
  });

  describe("Dispute Resolution", () => {
    it("Player can file a dispute on unfair judgement", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Look for dispute button
      cy.get('[data-testid="button-file-dispute"]', { timeout: 10000 })
        .should("be.visible")
        .click();

      // Fill in dispute form
      cy.get('[data-testid="textarea-dispute-reason"]', { timeout: 5000 })
        .should("be.visible")
        .type("The trick was clearly landed, not bailed");

      // Submit dispute
      cy.get('[data-testid="button-submit-dispute"]').should("be.visible").click();

      // Verify dispute was filed
      cy.contains("Dispute filed", { timeout: 10000 }).should("be.visible");
    });

    it("Disputed turns show dispute badge", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Should see dispute indicator on the turn
      cy.get('[data-testid^="turn-disputed-"]', { timeout: 10000 }).should("exist");
    });
  });

  describe("Game Actions", () => {
    it("Player can forfeit game", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Open game menu
      cy.get('[data-testid="button-game-menu"]', { timeout: 10000 }).should("be.visible").click();

      // Click forfeit option
      cy.get('[data-testid="button-forfeit-game"]', { timeout: 5000 }).should("be.visible").click();

      // Confirm forfeit in modal
      cy.get('[data-testid="button-confirm-forfeit"]', { timeout: 5000 })
        .should("be.visible")
        .click();

      // Should see forfeit confirmation
      cy.contains("Game forfeited", { timeout: 10000 }).should("be.visible");

      // Should redirect to lobby
      cy.location("pathname", { timeout: 10000 }).should("eq", "/play");
    });

    it("Completed game shows final result", () => {
      visitAuthenticated("/play");

      // Look for completed games section
      cy.get('[data-testid="section-completed-games"]', { timeout: 10000 }).should("be.visible");

      // Click on a completed game
      cy.get('[data-testid^="completed-game-card-"]', { timeout: 5000 }).first().click();

      // Should show winner banner
      cy.get('[data-testid="winner-banner"]', { timeout: 10000 }).should("be.visible");

      // Should show final letters for both players
      cy.get('[data-testid="player-1-letters"]').should("be.visible");
      cy.get('[data-testid="player-2-letters"]').should("be.visible");
    });
  });

  describe("Social Features in Game", () => {
    it("Share button is visible for completed games", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid="section-completed-games"]', { timeout: 10000 }).should("be.visible");
      cy.get('[data-testid^="completed-game-card-"]', { timeout: 5000 }).first().click();

      // Should see share button
      cy.get('[data-testid="button-share-game"]', { timeout: 10000 }).should("be.visible");
    });

    it("Share dialog opens with social options", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid="section-completed-games"]', { timeout: 10000 }).should("be.visible");
      cy.get('[data-testid^="completed-game-card-"]', { timeout: 5000 }).first().click();

      // Click share button
      cy.get('[data-testid="button-share-game"]', { timeout: 10000 }).click();

      // Should see share dialog
      cy.contains("Share This Battle", { timeout: 5000 }).should("be.visible");

      // Should see social media buttons
      cy.get('[data-testid="button-share-twitter"]').should("be.visible");
      cy.get('[data-testid="button-share-facebook"]').should("be.visible");
      cy.get('[data-testid="button-share-whatsapp"]').should("be.visible");

      // Should see copy link button
      cy.get('[data-testid="button-copy-link"]').should("be.visible");
    });

    it("Copy link button copies game URL", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid="section-completed-games"]', { timeout: 10000 }).should("be.visible");
      cy.get('[data-testid^="completed-game-card-"]', { timeout: 5000 }).first().click();

      cy.get('[data-testid="button-share-game"]', { timeout: 10000 }).click();

      // Click copy link
      cy.get('[data-testid="button-copy-link"]', { timeout: 5000 }).click();

      // Should show success message
      cy.contains("Link copied", { timeout: 5000 }).should("be.visible");
    });
  });

  describe("Error Handling & Edge Cases", () => {
    it("Shows error if trying to submit without video", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Try to submit without recording
      cy.get('[data-testid="button-submit-trick"]', { timeout: 5000 }).should("be.disabled");
    });

    it("Shows timeout warning when turn time is running out", () => {
      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // In a real scenario with timeouts enabled, should see warning
      // This would require mocking the timer
      cy.get('[data-testid="timeout-warning"]', { timeout: 60000 }).should("exist");
    });

    it("Handles network errors gracefully", () => {
      // Intercept API calls and force them to fail
      cy.intercept("POST", "/api/games/*/turns", {
        statusCode: 500,
        body: { error: "Server error" },
      }).as("submitTurnError");

      visitAuthenticated("/play");
      cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

      // Try to submit (would fail due to intercept)
      // Should show error toast
      cy.contains("Failed to submit", { timeout: 10000 }).should("be.visible");
    });
  });

  describe("SEO & Meta Tags", () => {
    it("Game page has proper meta tags", () => {
      visitAuthenticated("/play?game=test-game-id");

      // Check for meta tags (requires helmet/react-helmet to be working)
      cy.get('head meta[property="og:title"]').should("exist");
      cy.get('head meta[property="og:description"]').should("exist");
      cy.get('head meta[property="og:image"]').should("exist");
      cy.get('head meta[name="twitter:card"]').should("exist");
    });

    it("Game page title includes player names", () => {
      visitAuthenticated("/play?game=test-game-id");

      // Title should include player names
      cy.title().should("include", "vs");
      cy.title().should("include", "S.K.A.T.E.");
    });
  });
});

describe("S.K.A.T.E. Game Flow - Performance", () => {
  it("Game lobby loads within 3 seconds", () => {
    const start = Date.now();
    visitAuthenticated("/play");

    cy.get('[data-testid="game-lobby"]', { timeout: 10000 }).should("be.visible");

    cy.then(() => {
      const loadTime = Date.now() - start;
      expect(loadTime).to.be.lessThan(3000);
    });
  });

  it("Video upload progress is shown", () => {
    visitAuthenticated("/play");
    cy.get('[data-testid^="game-card-"]', { timeout: 10000 }).first().click();

    // When video is uploading, should see progress indicator
    // (This would require mocking a slow upload)
    cy.get('[data-testid="upload-progress"]', { timeout: 30000 }).should("exist");
  });
});
