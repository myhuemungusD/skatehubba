/**
 * Vitest global setup — mocks for browser APIs not available in jsdom/node.
 */

// Mock HTMLCanvasElement.getContext to suppress jsdom "Not implemented" warnings
// when code under test references canvas (e.g. thumbnail extraction, axe-core).
// We replace getContext entirely rather than wrapping the original, because
// jsdom's implementation logs to console.error before throwing.
if (typeof globalThis.HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = function getContext(
    contextId: string
  ): RenderingContext | null {
    if (contextId === "2d") {
      return {
        drawImage: () => {},
        fillRect: () => {},
        clearRect: () => {},
        getImageData: () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
        putImageData: () => {},
        measureText: () => ({ width: 0 }),
        fillText: () => {},
        strokeText: () => {},
        setTransform: () => {},
        resetTransform: () => {},
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        rect: () => {},
        clip: () => {},
        scale: () => {},
        rotate: () => {},
        translate: () => {},
        transform: () => {},
        createLinearGradient: () => ({ addColorStop: () => {} }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createPattern: () => null,
        canvas: this,
      } as unknown as CanvasRenderingContext2D;
    }
    return null;
  };
}
