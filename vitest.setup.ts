/**
 * Vitest global setup — mocks for browser APIs not available in jsdom/node.
 */

// Mock HTMLCanvasElement.getContext to suppress jsdom warnings
// when code under test references canvas (e.g. thumbnail extraction).
if (typeof globalThis.HTMLCanvasElement !== "undefined") {
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(
    contextId: string,
    ...args: unknown[]
  ): RenderingContext | null {
    try {
      return origGetContext.call(this, contextId, ...args);
    } catch {
      // Return a minimal stub so tests don't crash
      if (contextId === "2d") {
        return {
          drawImage: () => {},
          fillRect: () => {},
          clearRect: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(0) }),
          putImageData: () => {},
          canvas: this,
        } as unknown as CanvasRenderingContext2D;
      }
      return null;
    }
  };
}
