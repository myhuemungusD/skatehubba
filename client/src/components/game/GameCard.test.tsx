/**
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { axe } from "vitest-axe";
import { GameCard } from "./GameCard";
import type { Game } from "@/lib/api/game";

const makeGame = (overrides?: Partial<Game>): Game => ({
  id: "game-1",
  player1Id: "user-1",
  player1Name: "Alice",
  player2Id: "user-2",
  player2Name: "Bob",
  player1Letters: "SK",
  player2Letters: "S",
  status: "active",
  currentTurn: "user-1",
  turnPhase: "set_trick",
  offensivePlayerId: "user-1",
  defensivePlayerId: "user-2",
  player1DisputeUsed: false,
  player2DisputeUsed: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("GameCard", () => {
  it("renders opponent name", () => {
    render(<GameCard game={makeGame()} currentUserId="user-1" />);
    expect(screen.getByText(/Bob/)).toBeDefined();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    const { container } = render(
      <GameCard game={makeGame()} currentUserId="user-1" onClick={onClick} />
    );
    const card = container.firstElementChild;
    if (card) fireEvent.click(card);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("has aria-label with game context", () => {
    const { container } = render(<GameCard game={makeGame()} currentUserId="user-1" />);
    const el = container.querySelector("[aria-label]");
    expect(el).not.toBeNull();
    const label = el?.getAttribute("aria-label") ?? "";
    expect(label).toContain("Bob");
  });

  it("has no a11y violations", async () => {
    const { container } = render(<GameCard game={makeGame()} currentUserId="user-1" />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it("shows correct status for completed game", () => {
    const { container } = render(
      <GameCard
        game={makeGame({ status: "completed", winnerId: "user-1" })}
        currentUserId="user-1"
      />
    );
    expect(container.firstElementChild).not.toBeNull();
  });
});
