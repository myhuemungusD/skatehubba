/**
 * Shared test utilities for client component tests.
 *
 * Provides a `renderWithProviders` helper that wraps components in
 * the necessary providers (QueryClient, Router mock) so individual
 * test files don't have to duplicate setup boilerplate.
 */
import { type ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

/**
 * Renders a component wrapped in QueryClientProvider.
 * Each call creates a fresh QueryClient to avoid shared state between tests.
 */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

export { render, screen, within, fireEvent, waitFor } from "@testing-library/react";
