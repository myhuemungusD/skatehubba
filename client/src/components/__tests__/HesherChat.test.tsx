/**
 * @vitest-environment jsdom
 */

import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import HesherChat from "../HesherChat";

// Mock the hesherResponses module
vi.mock("../../lib/hesherResponses", () => ({
  getHesherResponse: vi.fn(() => "Test AI response"),
}));

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal("crypto", {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

// Mock scrollIntoView which is not available in jsdom
Element.prototype.scrollIntoView = vi.fn();

describe("HesherChat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    uuidCounter = 0;
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the chat bubble when closed", () => {
    render(<HesherChat />);
    expect(screen.getByTestId("hesher-bubble")).toBeDefined();
  });

  it("opens chat panel on bubble click", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("shows welcome message on first open", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));
    expect(screen.getByText(/Yo! I'm Hesher/)).toBeDefined();
  });

  it("closes chat panel via close button", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.click(screen.getByLabelText("Close chat"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends a message and shows user input", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));

    const input = screen.getByTestId("hesher-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Hello" } });
    expect(input.value).toBe("Hello");

    fireEvent.click(screen.getByTestId("hesher-send"));
    expect(screen.getByText("Hello")).toBeDefined();
  });

  it("sends message on Enter key", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));

    const input = screen.getByTestId("hesher-input");
    fireEvent.change(input, { target: { value: "Test message" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Test message")).toBeDefined();
  });

  it("does not send on Shift+Enter", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));

    const input = screen.getByTestId("hesher-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Test message" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    // Message should still be in input, not sent
    expect(input.value).toBe("Test message");
  });

  it("does not send empty messages", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));

    const sendButton = screen.getByTestId("hesher-send");
    expect(sendButton).toHaveProperty("disabled", true);
  });

  it("clears user messages when clear button is clicked", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));

    // Send a user message so there's more than just welcome
    const input = screen.getByTestId("hesher-input");
    fireEvent.change(input, { target: { value: "test user msg" } });
    fireEvent.click(screen.getByTestId("hesher-send"));
    expect(screen.getByText("test user msg")).toBeDefined();

    fireEvent.click(screen.getByLabelText("Clear chat"));

    // User message should be gone
    expect(screen.queryByText("test user msg")).toBeNull();
    // Welcome message re-appears because chat is still open with 0 messages
    expect(screen.getByText(/Yo! I'm Hesher/)).toBeDefined();
  });

  it("has maxLength on input field", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));

    const input = screen.getByTestId("hesher-input") as HTMLInputElement;
    expect(input.maxLength).toBe(500);
  });

  it("shows AI response after typing delay", async () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));

    const input = screen.getByTestId("hesher-input");
    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByTestId("hesher-send"));

    // AI response not shown yet (typing delay)
    expect(screen.queryByText("Test AI response")).toBeNull();

    // Advance past the typing delay
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });

    expect(screen.getByText("Test AI response")).toBeDefined();
  });

  it("persists messages to localStorage", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));

    // Welcome message should be saved
    const stored = localStorage.getItem("hesher-chat-messages");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("has accessible dialog labels when open", () => {
    render(<HesherChat />);
    fireEvent.click(screen.getByTestId("hesher-bubble"));

    // Dialog has aria-label
    expect(screen.getByLabelText("Hesher chat")).toBeDefined();

    // Buttons have aria-labels
    expect(screen.getByLabelText("Clear chat")).toBeDefined();
    expect(screen.getByLabelText("Close chat")).toBeDefined();
    expect(screen.getByLabelText("Send message")).toBeDefined();
  });

  it("has accessible bubble label when closed", () => {
    render(<HesherChat />);
    expect(screen.getByLabelText("Open Hesher chat")).toBeDefined();
  });
});
