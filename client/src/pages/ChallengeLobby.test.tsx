/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "@/test-utils";
import ChallengeLobby from "./ChallengeLobby";

// ── Mocks ──────────────────────────────────────────────────────

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLocation: () => ["/play", vi.fn()],
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

let mockUser: { uid: string; displayName?: string } | null = null;
let mockProfile: { username?: string; avatarUrl?: string } | null = null;
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    profile: mockProfile,
    backendDisplayName: "TestSkater",
  }),
}));

const mockMyGames = {
  activeGames: [],
  pendingChallenges: [],
  sentChallenges: [],
  completedGames: [],
};
let mockMyGamesData: typeof mockMyGames | undefined = undefined;
let mockGamesLoading = false;
let mockGamesError: Error | null = null;

let mockMyStats: { totalGames?: number } | undefined = undefined;

vi.mock("@/hooks/useSkateGameApi", () => ({
  useMyGames: () => ({
    data: mockMyGamesData,
    isLoading: mockGamesLoading,
    error: mockGamesError,
    refetch: vi.fn(),
  }),
  useMyStats: () => ({
    data: mockMyStats,
    isLoading: false,
    error: null,
  }),
  useRespondToGame: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
  useCreateGame: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/features/leaderboard/useRealtimeLeaderboard", () => ({
  useRealtimeLeaderboard: () => ({
    entries: [],
    isLoading: false,
  }),
}));

vi.mock("@/components/UserSearch", () => ({
  UserSearch: () => <div data-testid="mock-user-search">UserSearch</div>,
}));

vi.mock("@/components/game", () => ({
  GameCard: ({ game }: { game: { id: string } }) => (
    <div data-testid={`game-card-${game.id}`}>GameCard</div>
  ),
  PlayerStats: () => <div data-testid="player-stats">PlayerStats</div>,
}));

// ── Tests ──────────────────────────────────────────────────────

describe("ChallengeLobby", () => {
  beforeEach(() => {
    mockUser = { uid: "user-1", displayName: "TestSkater" };
    mockProfile = { username: "kickflipking" };
    mockMyGamesData = undefined;
    mockGamesLoading = false;
    mockGamesError = null;
    mockMyStats = undefined;
    mockToast.mockClear();

    // Stub clipboard + share for InviteButton
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => {}) },
    });
    Object.defineProperty(navigator, "share", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  // ── Invite button placement ────────────────────────────────

  describe("invite button placement", () => {
    it("always renders the prominent invite CTA", () => {
      renderWithProviders(<ChallengeLobby />);
      expect(screen.getByTestId("invite-button-prominent")).toBeDefined();
    });

    it("renders inline invite button in profile section", () => {
      renderWithProviders(<ChallengeLobby />);
      const inlineButtons = screen.getAllByTestId("invite-button");
      expect(inlineButtons.length).toBeGreaterThanOrEqual(1);
    });

    it("does NOT render duplicate invite buttons in empty state (no games loaded)", () => {
      mockMyGamesData = undefined;
      renderWithProviders(<ChallengeLobby />);

      // Prominent CTA is present
      expect(screen.getByTestId("invite-button-prominent")).toBeDefined();

      // There should be no gradient invite button in the empty state hero —
      // only the profile section's inline invite button
      const allInlineInviteButtons = screen.getAllByTestId("invite-button");
      expect(allInlineInviteButtons.length).toBe(1);
    });

    it("does NOT render duplicate invite buttons in empty state (games loaded, none active)", () => {
      mockMyGamesData = { ...mockMyGames };
      mockMyStats = { totalGames: 0 };
      renderWithProviders(<ChallengeLobby />);

      expect(screen.getByTestId("invite-button-prominent")).toBeDefined();
      // Only the profile section's inline invite, not the empty state's
      const allInviteButtons = screen.getAllByTestId("invite-button");
      expect(allInviteButtons.length).toBe(1);
    });
  });

  // ── Page structure ─────────────────────────────────────────

  describe("page structure", () => {
    it("renders Send Challenge section with user search", () => {
      renderWithProviders(<ChallengeLobby />);
      expect(screen.getByText("Send Challenge")).toBeDefined();
      expect(screen.getByTestId("mock-user-search")).toBeDefined();
    });

    it("renders Find Skaters CTA", () => {
      renderWithProviders(<ChallengeLobby />);
      expect(screen.getByText("Find Skaters")).toBeDefined();
    });

    it("renders HubbaShop promo", () => {
      renderWithProviders(<ChallengeLobby />);
      expect(screen.getByTestId("hub-hubbashop-link")).toBeDefined();
    });

    it("renders Rankings section", () => {
      renderWithProviders(<ChallengeLobby />);
      expect(screen.getByText("Rankings")).toBeDefined();
    });

    it("shows loading skeletons when games are loading", () => {
      mockGamesLoading = true;
      const { container } = renderWithProviders(<ChallengeLobby />);
      const skeletons = container.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("shows error banner with retry when games fail to load", () => {
      mockGamesError = new Error("Network error");
      renderWithProviders(<ChallengeLobby />);
      expect(screen.getByText("Could not load your games")).toBeDefined();
      expect(screen.getByText("Retry")).toBeDefined();
    });
  });

  // ── Profile section ────────────────────────────────────────

  describe("profile section", () => {
    it("shows user display name", () => {
      renderWithProviders(<ChallengeLobby />);
      expect(screen.getByText("TestSkater")).toBeDefined();
    });

    it("shows @username link", () => {
      renderWithProviders(<ChallengeLobby />);
      expect(screen.getByText("@kickflipking")).toBeDefined();
    });

    it("does not render profile section when not authenticated", () => {
      mockUser = null;
      renderWithProviders(<ChallengeLobby />);
      expect(screen.queryByText("@kickflipking")).toBeNull();
    });
  });

  // ── Empty states ───────────────────────────────────────────

  describe("empty states", () => {
    it("shows Ready to Play when no data and no error", () => {
      mockMyGamesData = undefined;
      mockGamesError = null;
      mockGamesLoading = false;
      renderWithProviders(<ChallengeLobby />);
      expect(screen.getByText("Ready to Play")).toBeDefined();
    });

    it("shows No Games Yet when data loaded but empty", () => {
      mockMyGamesData = { ...mockMyGames };
      mockMyStats = { totalGames: 0 };
      renderWithProviders(<ChallengeLobby />);
      expect(screen.getByText("No Games Yet")).toBeDefined();
    });

    it("empty state text references the invite CTA above", () => {
      mockMyGamesData = undefined;
      renderWithProviders(<ChallengeLobby />);
      // The empty state paragraph should tell users to use the invite button
      const emptyStateText = screen.getByText(/Invite a Friend.*to bring your crew/);
      expect(emptyStateText).toBeDefined();
    });
  });
});
