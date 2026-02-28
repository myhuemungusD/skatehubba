import { useEffect } from "react";
import { logPerformance, logger } from "../lib/logger";

interface PerformanceMetrics {
  fcp: number | null;
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  ttfb: number | null;
}

export function usePerformanceMonitor() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const metrics: PerformanceMetrics = {
      fcp: null,
      lcp: null,
      fid: null,
      cls: null,
      ttfb: null,
    };

    // Web Vitals observer
    const perfObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          metrics.fcp = entry.startTime;
          logPerformance("FCP", entry.startTime);
        }

        if (entry.entryType === "largest-contentful-paint") {
          metrics.lcp = entry.startTime;
          logPerformance("LCP", entry.startTime);
        }

        if (entry.entryType === "first-input") {
          const fidEntry = entry as PerformanceEventTiming;
          metrics.fid = fidEntry.processingStart - fidEntry.startTime;
          logPerformance("FID", metrics.fid);
        }

        if (entry.entryType === "layout-shift") {
          const layoutShift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!layoutShift.hadRecentInput) {
            const currentCls = metrics.cls ?? 0;
            const newCls = currentCls + (layoutShift.value || 0);
            metrics.cls = newCls;
            logPerformance("CLS", newCls, "");
          }
        }
      }
    });

    try {
      perfObserver.observe({
        entryTypes: ["paint", "largest-contentful-paint", "first-input", "layout-shift"],
      });
    } catch (error) {
      logger.warn("Performance monitoring not fully supported", error);
    }

    // Use Navigation Timing Level 2 API (performance.timing is deprecated)
    const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (navEntries.length > 0) {
      const nav = navEntries[0];
      metrics.ttfb = nav.responseStart - nav.requestStart;
      logPerformance("TTFB", metrics.ttfb);
    }

    return () => {
      perfObserver.disconnect();
    };
  }, []);
}
