/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import NotFound from "./not-found";

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

describe("NotFound", () => {
  it("renders the 404 heading", () => {
    render(<NotFound />);
    expect(screen.getByText("404 Page Not Found")).toBeDefined();
  });

  it("renders the explanation text", () => {
    render(<NotFound />);
    expect(screen.getByText("This page doesn't exist or may have been moved.")).toBeDefined();
  });

  it("renders Back to Home button with correct href", () => {
    render(<NotFound />);
    const homeButton = screen.getByTestId("button-home");
    expect(homeButton).toBeDefined();
    expect(homeButton.getAttribute("href")).toBe("/");
    expect(homeButton.textContent).toContain("Back to Home");
  });

  it("does not produce nested <a> tags in the Back to Home button", () => {
    render(<NotFound />);
    const homeButton = screen.getByTestId("button-home");
    expect(homeButton.querySelectorAll("a").length).toBe(0);
  });
});
