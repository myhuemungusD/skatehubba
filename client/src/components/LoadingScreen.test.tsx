/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";
import { LoadingScreen, PageLoadingSkeleton } from "./LoadingScreen";

describe("LoadingScreen", () => {
  it("renders loading indicators", () => {
    const { container } = render(<LoadingScreen />);
    // Should have 3 bouncing dots
    const dots = container.querySelectorAll(".animate-bounce");
    expect(dots.length).toBe(3);
  });

  it("has no a11y violations", async () => {
    const { container } = render(<LoadingScreen />);
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});

describe("PageLoadingSkeleton", () => {
  it("renders skeleton grid items", () => {
    const { container } = render(<PageLoadingSkeleton />);
    // Should render 6 grid skeleton cards
    const cards = container.querySelectorAll(".bg-\\[\\#232323\\]");
    expect(cards.length).toBe(6);
  });
});
