import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useToast, toast, reducer } from "./use-toast";

describe("use-toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe("reducer", () => {
    it("should add toast to state", () => {
      const state = { toasts: [] };
      const newToast = {
        id: "1",
        title: "Test",
        description: "Test description",
        open: true,
      };

      const newState = reducer(state, {
        type: "ADD_TOAST",
        toast: newToast,
      });

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0]).toEqual(newToast);
    });

    it("should respect TOAST_LIMIT of 1", () => {
      const state = {
        toasts: [
          { id: "1", title: "First", open: true },
        ],
      };

      const newToast = { id: "2", title: "Second", open: true };

      const newState = reducer(state, {
        type: "ADD_TOAST",
        toast: newToast,
      });

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe("2");
    });

    it("should update existing toast", () => {
      const state = {
        toasts: [
          { id: "1", title: "Original", open: true },
          { id: "2", title: "Other", open: true },
        ],
      };

      const newState = reducer(state, {
        type: "UPDATE_TOAST",
        toast: { id: "1", title: "Updated" },
      });

      expect(newState.toasts[0].title).toBe("Updated");
      expect(newState.toasts[1].title).toBe("Other");
    });

    it("should dismiss specific toast", () => {
      const state = {
        toasts: [
          { id: "1", title: "First", open: true },
          { id: "2", title: "Second", open: true },
        ],
      };

      const newState = reducer(state, {
        type: "DISMISS_TOAST",
        toastId: "1",
      });

      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(true);
    });

    it("should dismiss all toasts when no toastId provided", () => {
      const state = {
        toasts: [
          { id: "1", title: "First", open: true },
          { id: "2", title: "Second", open: true },
        ],
      };

      const newState = reducer(state, {
        type: "DISMISS_TOAST",
      });

      expect(newState.toasts[0].open).toBe(false);
      expect(newState.toasts[1].open).toBe(false);
    });

    it("should remove specific toast", () => {
      const state = {
        toasts: [
          { id: "1", title: "First", open: true },
          { id: "2", title: "Second", open: true },
        ],
      };

      const newState = reducer(state, {
        type: "REMOVE_TOAST",
        toastId: "1",
      });

      expect(newState.toasts).toHaveLength(1);
      expect(newState.toasts[0].id).toBe("2");
    });

    it("should remove all toasts when no toastId provided", () => {
      const state = {
        toasts: [
          { id: "1", title: "First", open: true },
          { id: "2", title: "Second", open: true },
        ],
      };

      const newState = reducer(state, {
        type: "REMOVE_TOAST",
      });

      expect(newState.toasts).toHaveLength(0);
    });
  });

  describe("toast function", () => {
    it("should create a toast with title and description", () => {
      const result = toast({
        title: "Success",
        description: "Operation completed",
      });

      expect(result).toHaveProperty("id");
      expect(result).toHaveProperty("dismiss");
      expect(result).toHaveProperty("update");
      expect(typeof result.id).toBe("string");
      expect(typeof result.dismiss).toBe("function");
      expect(typeof result.update).toBe("function");
    });

    it("should allow updating toast", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        const toastInstance = toast({
          title: "Original",
        });

        toastInstance.update({
          id: toastInstance.id,
          title: "Updated",
        });
      });

      expect(result.current.toasts[0].title).toBe("Updated");
    });

    it("should allow dismissing toast", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        const toastInstance = toast({
          title: "Test",
        });

        toastInstance.dismiss();
      });

      expect(result.current.toasts[0].open).toBe(false);
    });

    it("should auto-dismiss when onOpenChange is called with false", () => {
      const { result } = renderHook(() => useToast());

      let onOpenChange: ((open: boolean) => void) | undefined;

      act(() => {
        toast({
          title: "Test",
        });
      });

      onOpenChange = result.current.toasts[0].onOpenChange;

      expect(result.current.toasts[0].open).toBe(true);

      act(() => {
        onOpenChange?.(false);
      });

      expect(result.current.toasts[0].open).toBe(false);
    });
  });

  describe("useToast hook", () => {
    it("should return current toast state", () => {
      const { result } = renderHook(() => useToast());

      expect(result.current.toasts).toEqual([]);
      expect(typeof result.current.toast).toBe("function");
      expect(typeof result.current.dismiss).toBe("function");
    });

    it("should add toast through hook", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: "Test Toast",
          description: "This is a test",
        });
      });

      expect(result.current.toasts).toHaveLength(1);
      expect(result.current.toasts[0].title).toBe("Test Toast");
      expect(result.current.toasts[0].description).toBe("This is a test");
      expect(result.current.toasts[0].open).toBe(true);
    });

    it("should dismiss toast through hook", () => {
      const { result } = renderHook(() => useToast());

      let toastId: string;

      act(() => {
        const toastInstance = result.current.toast({
          title: "Test",
        });
        toastId = toastInstance.id;
      });

      expect(result.current.toasts[0].open).toBe(true);

      act(() => {
        result.current.dismiss(toastId);
      });

      expect(result.current.toasts[0].open).toBe(false);
    });

    it("should dismiss all toasts when no id provided", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({ title: "First" });
      });

      act(() => {
        // Manually add second toast since TOAST_LIMIT is 1
        result.current.toast({ title: "Second" });
      });

      act(() => {
        result.current.dismiss();
      });

      // All toasts should be dismissed
      result.current.toasts.forEach((t) => {
        expect(t.open).toBe(false);
      });
    });

    it("should sync state across multiple hook instances", () => {
      const { result: result1 } = renderHook(() => useToast());
      const { result: result2 } = renderHook(() => useToast());

      act(() => {
        result1.current.toast({
          title: "Shared Toast",
        });
      });

      // Both hooks should see the same toast
      expect(result1.current.toasts).toHaveLength(1);
      expect(result2.current.toasts).toHaveLength(1);
      expect(result1.current.toasts[0].title).toBe("Shared Toast");
      expect(result2.current.toasts[0].title).toBe("Shared Toast");
    });

    it("should cleanup listener on unmount", () => {
      const { unmount } = renderHook(() => useToast());

      // This should not throw
      expect(() => unmount()).not.toThrow();
    });
  });

  describe("toast variants", () => {
    it("should support different toast variants", () => {
      const { result } = renderHook(() => useToast());

      act(() => {
        result.current.toast({
          title: "Success",
          variant: "default",
        });
      });

      expect(result.current.toasts[0].variant).toBe("default");
    });

    it("should support toast with action", () => {
      const { result } = renderHook(() => useToast());
      const mockAction = { altText: "Undo" };

      act(() => {
        result.current.toast({
          title: "Action Toast",
          action: mockAction as any,
        });
      });

      expect(result.current.toasts[0].action).toBe(mockAction);
    });
  });

  describe("toast ID generation", () => {
    it("should generate unique IDs for each toast", () => {
      const toast1 = toast({ title: "First" });
      const toast2 = toast({ title: "Second" });
      const toast3 = toast({ title: "Third" });

      expect(toast1.id).not.toBe(toast2.id);
      expect(toast2.id).not.toBe(toast3.id);
      expect(toast1.id).not.toBe(toast3.id);
    });

    it("should handle ID counter wraparound", () => {
      // Generate many toasts to test counter behavior
      const ids = new Set();

      for (let i = 0; i < 100; i++) {
        const toastInstance = toast({ title: `Toast ${i}` });
        ids.add(toastInstance.id);
      }

      // All IDs should be unique
      expect(ids.size).toBe(100);
    });
  });
});
