/**
 * @vitest-environment jsdom
 */

import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";
import { toHaveNoViolations } from "vitest-axe/matchers";
import { EmptyState, LoadingEmptyState, ErrorEmptyState } from "./EmptyState";
import { LoadingScreen, PageLoadingSkeleton } from "./LoadingScreen";
import { Footer } from "./Footer";
import { Search } from "lucide-react";

expect.extend({ toHaveNoViolations });

describe("Accessibility (axe-core)", () => {
  it("LoadingScreen has no accessibility violations", async () => {
    const { container } = render(<LoadingScreen />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("PageLoadingSkeleton has no accessibility violations", async () => {
    const { container } = render(<PageLoadingSkeleton />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("EmptyState has no accessibility violations", async () => {
    const { container } = render(
      <EmptyState
        icon={Search}
        title="No results found"
        description="Try adjusting your search terms."
        actionLabel="Clear filters"
        onAction={() => {}}
      />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("LoadingEmptyState has no accessibility violations", async () => {
    const { container } = render(<LoadingEmptyState message="Fetching data..." />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("ErrorEmptyState has no accessibility violations", async () => {
    const { container } = render(
      <ErrorEmptyState message="Something went wrong" onRetry={() => {}} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("Footer has no accessibility violations", async () => {
    const { container } = render(<Footer />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
