/**
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

// Mock dependencies
vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) => (
    <a href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn() },
}));

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test error");
  return <div>Child content</div>;
}

describe("ErrorBoundary", () => {
  // Suppress console.error for expected errors
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Safe content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Safe content")).toBeDefined();
  });

  it("renders error UI when child throws", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Oops! Something went wrong")).toBeDefined();
    expect(
      screen.getByText("Don't worry, we've been notified and are looking into it.")
    ).toBeDefined();
  });

  it("renders Try Again and Go Home buttons", () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId("button-error-retry")).toBeDefined();
    expect(screen.getByTestId("button-error-home")).toBeDefined();
  });

  it("calls onReset when Try Again is clicked", () => {
    const onReset = vi.fn();
    render(
      <ErrorBoundary onReset={onReset}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByTestId("button-error-retry"));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("resets error state when resetKey changes", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey={1}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Oops! Something went wrong")).toBeDefined();

    // Rerender with new resetKey and non-throwing child
    rerender(
      <ErrorBoundary resetKey={2}>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Child content")).toBeDefined();
  });

  // Restore console.error
  afterAll(() => {
    console.error = originalError;
  });
});

// Need afterAll import
import { afterAll } from "vitest";
