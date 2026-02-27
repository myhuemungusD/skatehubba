/**
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { axe } from "vitest-axe";
import { Search } from "lucide-react";
import { EmptyState, LoadingEmptyState, ErrorEmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState icon={Search} title="No results" description="Try a different search." />);
    expect(screen.getByText("No results")).toBeDefined();
    expect(screen.getByText("Try a different search.")).toBeDefined();
  });

  it("renders action button when provided", () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        icon={Search}
        title="No spots"
        description="Add one."
        actionLabel="Add Spot"
        onAction={onAction}
      />
    );
    const btn = screen.getByTestId("button-empty-state-action");
    expect(btn.textContent).toBe("Add Spot");
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("does not render action button without both label and handler", () => {
    const { container } = render(
      <EmptyState icon={Search} title="No spots" description="None found." />
    );
    expect(container.querySelector("[data-testid='button-empty-state-action']")).toBeNull();
  });

  it("has no a11y violations", async () => {
    const { container } = render(
      <EmptyState icon={Search} title="No spots" description="None found." />
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});

describe("LoadingEmptyState", () => {
  it("renders default loading message", () => {
    render(<LoadingEmptyState />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders custom message", () => {
    render(<LoadingEmptyState message="Fetching data..." />);
    expect(screen.getByText("Fetching data...")).toBeDefined();
  });
});

describe("ErrorEmptyState", () => {
  it("renders default error message", () => {
    render(<ErrorEmptyState />);
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("renders retry button when handler provided", () => {
    const onRetry = vi.fn();
    render(<ErrorEmptyState onRetry={onRetry} />);
    const btn = screen.getByTestId("button-error-retry");
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
