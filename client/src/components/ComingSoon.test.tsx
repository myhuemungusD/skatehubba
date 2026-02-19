/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ComingSoon } from "./ComingSoon";

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

describe("ComingSoon", () => {
  it("renders the feature title", () => {
    render(<ComingSoon title="Live Battles" />);
    expect(screen.getByText("Live Battles")).toBeDefined();
  });

  it("renders custom description when provided", () => {
    render(<ComingSoon title="Battles" description="Compete worldwide in real-time." />);
    expect(screen.getByText("Compete worldwide in real-time.")).toBeDefined();
  });

  it("renders default description when none provided", () => {
    render(<ComingSoon title="Battles" />);
    expect(
      screen.getByText(
        "This feature is coming soon. We're working hard to bring you an amazing experience."
      )
    ).toBeDefined();
  });

  it('renders "Coming Soon" badge', () => {
    render(<ComingSoon title="Battles" />);
    expect(screen.getByText("Coming Soon")).toBeDefined();
  });

  it("renders Back to Home link with correct href", () => {
    render(<ComingSoon title="Battles" />);
    const backLink = screen.getByText("Back to Home").closest("a");
    expect(backLink).not.toBeNull();
    expect(backLink!.getAttribute("href")).toBe("/home");
  });

  it("does not produce nested <a> tags in the Back to Home button", () => {
    render(<ComingSoon title="Battles" />);
    const backLink = screen.getByText("Back to Home").closest("a")!;
    expect(backLink.querySelectorAll("a").length).toBe(0);
  });

  it("renders custom icon when provided", () => {
    const customIcon = <div data-testid="custom-icon">🛹</div>;
    render(<ComingSoon title="Battles" icon={customIcon} />);
    expect(screen.getByTestId("custom-icon")).toBeDefined();
  });
});
