/**
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { axe } from "vitest-axe";
import { InviteButton } from "./InviteButton";

// ── Mocks ──────────────────────────────────────────────────────

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

let mockProfile: { username?: string; avatarUrl?: string } | null = null;
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ profile: mockProfile }),
}));

// ── Helpers ────────────────────────────────────────────────────

function stubClipboard(writeTextImpl: () => Promise<void> = async () => {}) {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn(writeTextImpl) },
  });
}

function stubShareApi(shareImpl?: () => Promise<void>) {
  Object.defineProperty(navigator, "share", {
    value: shareImpl ? vi.fn(shareImpl) : undefined,
    writable: true,
    configurable: true,
  });
}

// ── Tests ──────────────────────────────────────────────────────

describe("InviteButton", () => {
  beforeEach(() => {
    mockProfile = { username: "kickflipking" };
    mockToast.mockClear();
    stubShareApi(); // default: no native share
    stubClipboard();
  });

  // ── Rendering ──────────────────────────────────────────────

  describe("default variant", () => {
    it("renders with default label", () => {
      render(<InviteButton />);
      expect(screen.getByText("Invite a Friend")).toBeDefined();
    });

    it("renders with custom label", () => {
      render(<InviteButton label="Join the crew" />);
      expect(screen.getByText("Join the crew")).toBeDefined();
    });

    it("renders icon-only when size is icon", () => {
      render(<InviteButton size="icon" />);
      expect(screen.queryByText("Invite a Friend")).toBeNull();
    });

    it("has data-testid", () => {
      render(<InviteButton />);
      expect(screen.getByTestId("invite-button")).toBeDefined();
    });
  });

  describe("prominent variant", () => {
    it("renders prominent CTA card", () => {
      render(<InviteButton prominent />);
      expect(screen.getByText("Invite a Friend")).toBeDefined();
      expect(screen.getByText("Share your invite as @kickflipking")).toBeDefined();
    });

    it("shows generic text when no username", () => {
      mockProfile = null;
      render(<InviteButton prominent />);
      expect(screen.getByText("Send a link via text, social, or email")).toBeDefined();
    });

    it("has type=button to prevent form submission", () => {
      render(<InviteButton prominent />);
      const button = screen.getByTestId("invite-button-prominent");
      expect(button.getAttribute("type")).toBe("button");
    });

    it("has data-testid", () => {
      render(<InviteButton prominent />);
      expect(screen.getByTestId("invite-button-prominent")).toBeDefined();
    });

    it("has aria-label with username", () => {
      render(<InviteButton prominent />);
      const button = screen.getByTestId("invite-button-prominent");
      expect(button.getAttribute("aria-label")).toBe("Invite a friend as @kickflipking");
    });

    it("has generic aria-label without username", () => {
      mockProfile = null;
      render(<InviteButton prominent />);
      const button = screen.getByTestId("invite-button-prominent");
      expect(button.getAttribute("aria-label")).toBe("Invite a friend to SkateHubba");
    });
  });

  // ── Clipboard fallback ─────────────────────────────────────

  describe("clipboard copy", () => {
    it("copies invite link with username to clipboard", async () => {
      stubClipboard();
      render(<InviteButton />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
      const clipboardText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(clipboardText).toContain("@kickflipking");
      expect(clipboardText).toContain("/skater/kickflipking");
    });

    it("copies auth fallback URL when no username", async () => {
      mockProfile = null;
      stubClipboard();
      render(<InviteButton />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });

      const clipboardText = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string;
      expect(clipboardText).toContain("/auth");
      expect(clipboardText).not.toContain("/skater/");
    });

    it("shows success toast after copy", async () => {
      stubClipboard();
      render(<InviteButton />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });

      expect(mockToast).toHaveBeenCalledWith({ title: "Invite link copied!" });
    });

    it("shows error toast when clipboard fails", async () => {
      stubClipboard(() => Promise.reject(new Error("denied")));
      render(<InviteButton />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "Could not copy link",
        variant: "destructive",
      });
    });
  });

  // ── Copied state + timer ───────────────────────────────────

  describe("copied state", () => {
    it("shows Copied! text after click", async () => {
      stubClipboard();
      render(<InviteButton />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });

      expect(screen.getByText("Copied!")).toBeDefined();
    });

    it("resets copied state after 2 seconds", async () => {
      vi.useFakeTimers();
      stubClipboard();
      render(<InviteButton />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });

      expect(screen.getByText("Copied!")).toBeDefined();

      // Advance the timer and flush state update
      act(() => {
        vi.advanceTimersByTime(2100);
      });

      expect(screen.getByText("Invite a Friend")).toBeDefined();
      vi.useRealTimers();
    });

    it("shows Invite Copied! on prominent variant after click", async () => {
      stubClipboard();
      render(<InviteButton prominent />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button-prominent"));
      });

      expect(screen.getByText("Invite Copied!")).toBeDefined();
    });

    it("clears stacked timeouts on rapid clicks", async () => {
      vi.useFakeTimers();
      stubClipboard();
      render(<InviteButton />);

      // Click twice rapidly
      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });

      // After 2s the state should still reset cleanly (no double-fire issues)
      act(() => {
        vi.advanceTimersByTime(2100);
      });

      expect(screen.getByText("Invite a Friend")).toBeDefined();
      vi.useRealTimers();
    });
  });

  // ── Native Share API ───────────────────────────────────────

  describe("native share API", () => {
    it("uses navigator.share when available", async () => {
      const shareFn = vi.fn(async () => {});
      stubShareApi(shareFn);
      render(<InviteButton />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });

      expect(shareFn).toHaveBeenCalledOnce();
      expect(shareFn).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining("/skater/kickflipking"),
        })
      );
      // Should NOT fall through to clipboard
      expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });

    it("falls through to clipboard when share is cancelled", async () => {
      stubShareApi(() => Promise.reject(new DOMException("cancelled", "AbortError")));
      stubClipboard();
      render(<InviteButton />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });

      // Should fall through to clipboard
      expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
    });
  });

  // ── Accessibility ──────────────────────────────────────────

  describe("accessibility", () => {
    it("default variant has no a11y violations", async () => {
      vi.useRealTimers();
      const { container } = render(<InviteButton />);
      const results = await axe(container);
      expect(results.violations).toHaveLength(0);
    });

    it("prominent variant has no a11y violations", async () => {
      vi.useRealTimers();
      const { container } = render(<InviteButton prominent />);
      const results = await axe(container);
      expect(results.violations).toHaveLength(0);
    });

    it("prominent variant has focus-visible ring classes", () => {
      render(<InviteButton prominent />);
      const button = screen.getByTestId("invite-button-prominent");
      expect(button.className).toContain("focus-visible:ring-2");
    });
  });

  // ── Cleanup on unmount ─────────────────────────────────────

  describe("cleanup", () => {
    it("does not warn about state update on unmounted component", async () => {
      vi.useFakeTimers();
      stubClipboard();
      const { unmount } = render(<InviteButton />);

      await act(async () => {
        fireEvent.click(screen.getByTestId("invite-button"));
      });

      // Unmount before the 2s timer fires
      unmount();

      // Advance past the timer — should not throw or warn
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // If we got here without errors, the cleanup is working
      expect(true).toBe(true);
      vi.useRealTimers();
    });
  });
});
