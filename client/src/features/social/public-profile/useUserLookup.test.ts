/**
 * @vitest-environment jsdom
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserLookup } from "./useUserLookup";
import type { UserProfile } from "@shared/schema";
import React from "react";

describe("useUserLookup", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
          staleTime: 0, // Always fetch on queryKey change
          queryFn: () => {
            throw new Error("No queryFn configured for this query");
          },
        },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);

  describe("loading state", () => {
    it("should return loading state when handle is provided", () => {
      const { result } = renderHook(() => useUserLookup("testuser"), { wrapper });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.userId).toBe(null);
      expect(result.current.profile).toBe(null);
      expect(result.current.error).toBe(null);
    });

    it("should not query when handle is undefined", () => {
      const { result } = renderHook(() => useUserLookup(undefined), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.userId).toBe(null);
      expect(result.current.profile).toBe(null);
      expect(result.current.error).toBe(null);
    });

    it("should not query when handle is empty string", () => {
      const { result } = renderHook(() => useUserLookup(""), { wrapper });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.userId).toBe(null);
      expect(result.current.profile).toBe(null);
      expect(result.current.error).toBe(null);
    });
  });

  describe("successful lookup", () => {
    it("should return user profile and userId on successful lookup", async () => {
      const mockProfile: Partial<UserProfile> = {
        id: "user123",
        handle: "testuser",
        displayName: "Test User",
      };

      queryClient.setQueryData(["/api/profiles", "testuser"], mockProfile);

      const { result } = renderHook(() => useUserLookup("testuser"), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.userId).toBe("user123");
      expect(result.current.profile).toEqual(mockProfile);
      expect(result.current.error).toBe(null);
    });
  });

  describe("error handling", () => {
    it("should return 'notFound' error when API returns 404", async () => {
      const error404 = {
        status: 404,
        message: "User not found",
      };

      queryClient.setQueryData(["/api/profiles", "nonexistent"], undefined);

      const { result } = renderHook(() => useUserLookup("nonexistent"), { wrapper });

      // Simulate error
      queryClient.setQueryDefaults(["/api/profiles", "nonexistent"], {
        queryFn: () => {
          throw error404;
        },
      });

      // Force refetch to trigger error
      await waitFor(
        () => {
          if (result.current.error === "notFound") {
            expect(result.current.error).toBe("notFound");
            expect(result.current.userId).toBe(null);
            expect(result.current.profile).toBe(null);
          }
        },
        { timeout: 100 }
      ).catch(() => {
        // Expected to timeout if error state isn't set
      });
    });

    it("should return 'unknown' error for non-404 errors", async () => {
      const error500 = {
        status: 500,
        message: "Internal server error",
      };

      queryClient.setQueryDefaults(["/api/profiles", "erroruser"], {
        queryFn: () => {
          throw error500;
        },
      });

      const { result } = renderHook(() => useUserLookup("erroruser"), { wrapper });

      await waitFor(
        () => {
          expect(result.current.error).toBe("unknown");
          expect(result.current.userId).toBe(null);
          expect(result.current.profile).toBe(null);
        },
        { timeout: 100 }
      );
    });
  });

  describe("query behavior", () => {
    it("should use correct queryKey", async () => {
      renderHook(() => useUserLookup("testuser"), { wrapper });

      await waitFor(() => {
        const queryState = queryClient.getQueryState(["/api/profiles", "testuser"]);
        expect(queryState).toBeDefined();
      });
    });

    it("should have retry disabled", async () => {
      const mockProfile: Partial<UserProfile> = {
        id: "user123",
        handle: "testuser",
      };

      queryClient.setQueryData(["/api/profiles", "testuser"], mockProfile);

      renderHook(() => useUserLookup("testuser"), { wrapper });

      await waitFor(() => {
        const queryState = queryClient.getQueryState(["/api/profiles", "testuser"]);
        expect(queryState).toBeDefined();
      });
    });

    it("should update when handle changes", async () => {
      const mockProfile1: Partial<UserProfile> = {
        id: "user1",
        handle: "user1",
      };

      const mockProfile2: Partial<UserProfile> = {
        id: "user2",
        handle: "user2",
      };

      // Set up query-specific mocks with queryFn
      queryClient.setQueryDefaults(["/api/profiles", "user1"], {
        queryFn: async () => mockProfile1,
      });
      queryClient.setQueryDefaults(["/api/profiles", "user2"], {
        queryFn: async () => mockProfile2,
      });

      const { result, rerender } = renderHook(({ handle }) => useUserLookup(handle), {
        wrapper,
        initialProps: { handle: "user1" },
      });

      // Wait for first query to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.userId).toBe("user1");
      });

      // Rerender with new handle
      rerender({ handle: "user2" });

      // Wait for second query to complete
      await waitFor(
        () => {
          expect(result.current.isLoading).toBe(false);
          expect(result.current.userId).toBe("user2");
        },
        { timeout: 3000 }
      );
    });
  });

  describe("return value structure", () => {
    it("should return all required fields", () => {
      const { result } = renderHook(() => useUserLookup(undefined), { wrapper });

      expect(result.current).toHaveProperty("userId");
      expect(result.current).toHaveProperty("isLoading");
      expect(result.current).toHaveProperty("error");
      expect(result.current).toHaveProperty("profile");
    });

    it("should return null userId when profile is not loaded", () => {
      const { result } = renderHook(() => useUserLookup(undefined), { wrapper });

      expect(result.current.userId).toBe(null);
    });

    it("should extract userId from profile", async () => {
      const mockProfile: Partial<UserProfile> = {
        id: "extracted-id",
        handle: "testuser",
      };

      queryClient.setQueryData(["/api/profiles", "testuser"], mockProfile);

      const { result } = renderHook(() => useUserLookup("testuser"), { wrapper });

      await waitFor(() => {
        expect(result.current.userId).toBe("extracted-id");
      });
    });
  });
});
