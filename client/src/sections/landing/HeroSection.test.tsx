/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { HeroSection } from "./HeroSection";

// Mock wouter Link as a standard <a> to validate href propagation.
// In Wouter v3 Link renders as <a> natively — this mock mirrors that.
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

describe("HeroSection", () => {
  const baseProps = {
    title: "Own the Spot.",
  };

  it("renders the title", () => {
    render(<HeroSection {...baseProps} />);
    expect(screen.getByText("Own the Spot.")).toBeDefined();
  });

  it("renders subtitle when provided", () => {
    render(<HeroSection {...baseProps} subtitle="Play SKATE Anywhere." />);
    expect(screen.getByText("Play SKATE Anywhere.")).toBeDefined();
  });

  it("renders description when provided", () => {
    render(<HeroSection {...baseProps} description="The ultimate platform" />);
    expect(screen.getByText("The ultimate platform")).toBeDefined();
  });

  it("renders badge with success variant", () => {
    render(<HeroSection {...baseProps} badge={{ text: "Beta Available", variant: "success" }} />);
    expect(screen.getByText("Beta Available")).toBeDefined();
  });

  it("renders badge with info variant", () => {
    render(<HeroSection {...baseProps} badge={{ text: "New Update", variant: "info" }} />);
    expect(screen.getByText("New Update")).toBeDefined();
  });

  it("renders eyebrow text when provided", () => {
    render(<HeroSection {...baseProps} eyebrow="The Future of Skateboarding" />);
    expect(screen.getByText("The Future of Skateboarding")).toBeDefined();
  });

  describe("CTA links", () => {
    it("renders primary CTA as a navigable link with correct href", () => {
      render(
        <HeroSection
          {...baseProps}
          primaryCTA={{ text: "Sign In / Sign Up", href: "/auth", testId: "cta-primary" }}
        />
      );

      const link = screen.getByTestId("cta-primary");
      expect(link).toBeDefined();
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe("/auth");
      expect(link.textContent).toContain("Sign In / Sign Up");
    });

    it("renders secondary CTA as a navigable link with correct href", () => {
      render(
        <HeroSection
          {...baseProps}
          secondaryCTA={{ text: "Learn More", href: "/specs", testId: "cta-secondary" }}
        />
      );

      const link = screen.getByTestId("cta-secondary");
      expect(link).toBeDefined();
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe("/specs");
      expect(link.textContent).toContain("Learn More");
    });

    it("renders both CTAs simultaneously", () => {
      render(
        <HeroSection
          {...baseProps}
          primaryCTA={{ text: "Sign In", href: "/auth", testId: "cta-primary" }}
          secondaryCTA={{ text: "Specs", href: "/specs", testId: "cta-secondary" }}
        />
      );

      expect(screen.getByTestId("cta-primary").getAttribute("href")).toBe("/auth");
      expect(screen.getByTestId("cta-secondary").getAttribute("href")).toBe("/specs");
    });

    it("does not produce nested <a> tags inside CTA links", () => {
      render(
        <HeroSection
          {...baseProps}
          primaryCTA={{ text: "Sign In", href: "/auth", testId: "cta-primary" }}
        />
      );

      const link = screen.getByTestId("cta-primary");
      // The link itself is <a>, and it must NOT contain another <a> child
      const nestedAnchors = link.querySelectorAll("a");
      expect(nestedAnchors.length).toBe(0);
    });

    it("does not render CTA section when neither CTA is provided", () => {
      const { container } = render(<HeroSection {...baseProps} />);
      expect(container.querySelectorAll("a")).toHaveLength(0);
    });
  });

  describe("trust indicators", () => {
    it("renders trust indicators when provided", () => {
      const MockIcon = ({ className }: { className?: string }) => (
        <svg className={className} data-testid="mock-icon" />
      );
      render(
        <HeroSection
          {...baseProps}
          trustIndicators={[
            { icon: MockIcon as any, text: "Enterprise Security", color: "text-green-400" },
            { icon: MockIcon as any, text: "Real-time Infra", color: "text-amber-400" },
          ]}
        />
      );

      expect(screen.getByText("Enterprise Security")).toBeDefined();
      expect(screen.getByText("Real-time Infra")).toBeDefined();
    });

    it("does not render trust indicators section when array is empty", () => {
      const { container } = render(<HeroSection {...baseProps} trustIndicators={[]} />);
      expect(container.querySelector(".flex-wrap")).toBeNull();
    });
  });
});
