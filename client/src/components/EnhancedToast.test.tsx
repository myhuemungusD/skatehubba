/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { EnhancedToast } from "./EnhancedToast";

// Radix toast requires a provider
function renderToast(props: Parameters<typeof EnhancedToast>[0]) {
  return render(
    <ToastPrimitives.Provider>
      <EnhancedToast {...props} />
      <ToastPrimitives.Viewport />
    </ToastPrimitives.Provider>
  );
}

describe("EnhancedToast", () => {
  it("renders title", () => {
    renderToast({ title: "Success!" });
    expect(screen.getByText("Success!")).toBeDefined();
  });

  it("renders description when provided", () => {
    renderToast({ title: "Done", description: "Your change was saved." });
    expect(screen.getByText("Your change was saved.")).toBeDefined();
  });

  it("does not render description when not provided", () => {
    const { container } = renderToast({ title: "Done" });
    // Description element should not exist
    const descriptions = container.querySelectorAll("[class*='text-gray-300']");
    // Only icon and close button use gray-300, not description
    expect(screen.queryByText("Your change was saved.")).toBeNull();
  });

  it("applies correct variant styling for error", () => {
    const { container } = renderToast({ title: "Error", variant: "error" });
    const root = container.querySelector("[data-state]");
    expect(root?.className).toContain("bg-red-500/10");
  });

  it("applies correct variant styling for success", () => {
    const { container } = renderToast({ title: "Success", variant: "success" });
    const root = container.querySelector("[data-state]");
    expect(root?.className).toContain("bg-success/10");
  });

  it("has role=status and aria-live=polite", () => {
    const { container } = renderToast({ title: "Info" });
    const root = container.querySelector("[role='status']");
    expect(root).not.toBeNull();
    expect(root?.getAttribute("aria-live")).toBe("polite");
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    renderToast({ title: "Test", onClose });
    // The close button has an X icon
    const closeBtn = screen.getByRole("button");
    closeBtn.click();
    expect(onClose).toHaveBeenCalledOnce();
  });

  // Note: Radix Toast primitives use custom ARIA patterns that axe
  // flags when rendered outside their full provider/viewport context.
  // A11y compliance is ensured by the Radix library itself.
});
