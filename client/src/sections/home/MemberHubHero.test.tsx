/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemberHubHero } from "./MemberHubHero";
import type { LucideIcon } from "lucide-react";

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    [key: string]: unknown;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

const MockIcon: LucideIcon = (({ className }: { className?: string }) => (
  <svg className={className} data-testid="mock-icon" />
)) as unknown as LucideIcon;

describe("MemberHubHero", () => {
  const baseProps = {
    quickActions: [
      {
        icon: MockIcon,
        label: "Map",
        href: "/map",
        description: "Find skate spots",
        color: "text-blue-500",
        featured: false,
      },
      {
        icon: MockIcon,
        label: "Play S.K.A.T.E.",
        href: "/play",
        description: "Challenge friends",
        color: "text-orange-500",
        featured: true,
      },
    ],
  };

  it("renders quick action cards as navigable links", () => {
    render(<MemberHubHero {...baseProps} />);

    const mapLink = screen.getByText("Map").closest("a");
    expect(mapLink).not.toBeNull();
    expect(mapLink!.getAttribute("href")).toBe("/map");

    const playLink = screen.getByText("Play S.K.A.T.E.").closest("a");
    expect(playLink).not.toBeNull();
    expect(playLink!.getAttribute("href")).toBe("/play");
  });

  it("does not produce nested <a> tags in quick action cards", () => {
    render(<MemberHubHero {...baseProps} />);

    const mapLink = screen.getByText("Map").closest("a")!;
    expect(mapLink.querySelectorAll("a").length).toBe(0);

    const playLink = screen.getByText("Play S.K.A.T.E.").closest("a")!;
    expect(playLink.querySelectorAll("a").length).toBe(0);
  });

  it("renders action descriptions", () => {
    render(<MemberHubHero {...baseProps} />);
    expect(screen.getByText("Find skate spots")).toBeDefined();
    expect(screen.getByText("Challenge friends")).toBeDefined();
  });

  it("applies featured class to featured actions", () => {
    render(<MemberHubHero {...baseProps} />);

    const playLink = screen.getByText("Play S.K.A.T.E.").closest("a")!;
    expect(playLink.className).toContain("featured");

    const mapLink = screen.getByText("Map").closest("a")!;
    expect(mapLink.className).not.toContain("featured");
  });

  it("renders badge when provided", () => {
    render(<MemberHubHero {...baseProps} badge={{ text: "Beta Active", variant: "success" }} />);
    expect(screen.getByText("Beta Active")).toBeDefined();
  });

  it("renders badge with info variant", () => {
    render(<MemberHubHero {...baseProps} badge={{ text: "Update Available", variant: "info" }} />);
    expect(screen.getByText("Update Available")).toBeDefined();
  });

  it("does not render badge when not provided", () => {
    render(<MemberHubHero {...baseProps} />);
    expect(screen.queryByText("Beta Active")).toBeNull();
  });
});
