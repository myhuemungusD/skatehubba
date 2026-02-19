/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import PublicNavigation from "./PublicNavigation";

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

describe("PublicNavigation", () => {
  it("renders the SkateHubba logo linking to home", () => {
    render(<PublicNavigation />);
    const logo = screen.getByText("SkateHubba");
    expect(logo).toBeDefined();
    const logoLink = logo.closest("a");
    expect(logoLink).not.toBeNull();
    expect(logoLink!.getAttribute("href")).toBe("/");
  });

  it("renders the Join the Beta CTA with correct href", () => {
    render(<PublicNavigation />);
    const signinButton = screen.getByTestId("button-public-nav-signin");
    expect(signinButton).toBeDefined();
    expect(signinButton.getAttribute("href")).toBe("/auth?tab=signup");
    expect(signinButton.textContent).toContain("Join the Beta");
  });

  it("does not produce nested <a> tags in the Sign In CTA", () => {
    render(<PublicNavigation />);
    const signinButton = screen.getByTestId("button-public-nav-signin");
    // Button asChild renders as the Link (<a>), so the button itself is <a>.
    // It must NOT contain another <a> inside it.
    const nestedAnchors = signinButton.querySelectorAll("a");
    expect(nestedAnchors.length).toBe(0);
  });

  it("renders the Merch external link correctly", () => {
    render(<PublicNavigation />);
    const merchLink = screen.getByText("Merch").closest("a");
    expect(merchLink).not.toBeNull();
    expect(merchLink!.getAttribute("href")).toBe("https://skatehubba.store/");
    expect(merchLink!.getAttribute("target")).toBe("_blank");
    expect(merchLink!.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("has proper navigation landmark with accessible label", () => {
    render(<PublicNavigation />);
    const nav = screen.getByRole("navigation", { name: "Public navigation" });
    expect(nav).toBeDefined();
  });
});
