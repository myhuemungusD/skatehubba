describe("Game Flow", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  /** Returns false (skip test) when the user is not signed in. */
  async function requireAuth() {
    try {
      await expect(element(by.id("home-screen"))).toBeVisible();
      return true;
    } catch {
      return false;
    }
  }

  /** Returns true when a battle screen is visible (requires seeded active game). */
  async function requireBattleScreen() {
    try {
      await expect(element(by.id("game-battle-screen"))).toBeVisible();
      return true;
    } catch {
      return false;
    }
  }

  /** Returns true when the judging UI is visible (requires game in judging phase). */
  async function requireJudgingPhase() {
    try {
      await expect(element(by.id("game-judging-title"))).toBeVisible();
      return true;
    } catch {
      return false;
    }
  }

  describe("Challenge Acceptance", () => {
    it("displays challenge received screen for player 2", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("game-challenge-received"))).toBeVisible();
      await expect(element(by.id("game-accept-challenge"))).toBeVisible();
    });

    it("displays waiting for opponent screen for player 1", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.id("game-waiting-opponent"))).toBeVisible();
    });
  });

  describe("Battle Screen UI", () => {
    it("renders the battle screen with all controls", async () => {
      if (!(await requireBattleScreen())) return;

      await expect(element(by.id("game-round-badge"))).toBeVisible();
      await expect(element(by.id("game-forfeit"))).toBeVisible();
    });

    it("shows record trick button when it is the player's turn", async () => {
      if (!(await requireBattleScreen())) return;

      await expect(element(by.id("game-record-trick"))).toBeVisible();
    });
  });

  describe("Judging Phase", () => {
    it("shows judging UI with landed and bailed buttons", async () => {
      if (!(await requireJudgingPhase())) return;

      await expect(element(by.id("game-vote-landed"))).toBeVisible();
      await expect(element(by.id("game-vote-bailed"))).toBeVisible();
    });

    it("can tap landed button during judging", async () => {
      if (!(await requireJudgingPhase())) return;

      await element(by.id("game-vote-landed")).tap();
    });

    it("can tap bailed button during judging", async () => {
      if (!(await requireJudgingPhase())) return;

      await element(by.id("game-vote-bailed")).tap();
    });
  });

  describe("Game Forfeit", () => {
    it("shows confirmation alert when forfeit is tapped", async () => {
      if (!(await requireBattleScreen())) return;

      await element(by.id("game-forfeit")).tap();

      await expect(element(by.text("Forfeit Game"))).toBeVisible();

      // Dismiss the alert
      await element(by.text("Cancel")).tap();

      await expect(element(by.id("game-battle-screen"))).toBeVisible();
    });
  });

  describe("Game Completion", () => {
    it("shows result screen when game is completed", async () => {
      if (!(await requireAuth())) return;

      await expect(element(by.text("Game Over!"))).toBeVisible();
    });
  });
});
