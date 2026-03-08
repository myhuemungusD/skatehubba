/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { HubbaShopBanner } from "./HubbaShopBanner";
import { EXTERNAL_LINKS } from "@/config/externalLinks";

describe("HubbaShopBanner", () => {
  it("renders the shop now link with correct href", () => {
    render(<HubbaShopBanner />);
    const link = screen.getByTestId("cta-hubbashop");
    expect(link.getAttribute("href")).toBe(EXTERNAL_LINKS.HUBBASHOP);
  });

  it("opens in a new tab with security attributes", () => {
    render(<HubbaShopBanner />);
    const link = screen.getByTestId("cta-hubbashop");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("has an accessible section label", () => {
    render(<HubbaShopBanner />);
    const section = screen.getByRole("region", { name: "HubbaShop merch" });
    expect(section).toBeDefined();
  });

  it("displays the HubbaShop heading", () => {
    render(<HubbaShopBanner />);
    expect(screen.getByRole("heading", { level: 2 })).toBeDefined();
    expect(screen.getByText("HubbaShop")).toBeDefined();
  });
});
