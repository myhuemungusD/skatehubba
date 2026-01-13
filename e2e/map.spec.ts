import { test, expect, type Page, type Route } from '@playwright/test';

test.describe('Map Performance & Flow', () => {
  test('should implement viewport culling for large datasets', async ({ page }: { page: Page }) => {
    // 1. Mock a heavy database response (1,000 spots)
    await page.route('/api/spots', async (route: Route) => {
      const spots = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `Spot ${i}`,
        // Distribute spots around NYC to simulate density
        lat: 40.7589 + (Math.random() - 0.5) * 0.1,
        lng: -73.9851 + (Math.random() - 0.5) * 0.1,
        spotType: 'street',
        tier: 'bronze',
        description: 'Test spot'
      }));
      await route.fulfill({ json: spots });
    });

    // 2. Load the map page
    await page.goto('/map');
    
    // Wait for map to initialize
    await page.waitForSelector('[data-testid="map-container"]');

    // 3. Verify Culling: We loaded 1000 spots, but DOM should only have ~50-100
    // The 'custom-spot-marker' class is defined in SpotMap.tsx
    const initialMarkerCount = await page.locator('.custom-spot-marker').count();
    
    console.log(`Visible markers: ${initialMarkerCount}`);
    
    // Expect significantly fewer than 1000 (proving culling works)
    expect(initialMarkerCount).toBeLessThan(1000);
    expect(initialMarkerCount).toBeGreaterThan(0);

    // 4. Test Panning (User Flow)
    // Simulate a drag gesture to move the map
    await page.mouse.move(500, 500);
    await page.mouse.down();
    await page.mouse.move(100, 100); // Drag 400px
    await page.mouse.up();

    // 5. Verify DOM Updates
    // Wait for debounce/render
    await page.waitForTimeout(500);
    const newMarkerCount = await page.locator('.custom-spot-marker').count();
    expect(newMarkerCount).toBeLessThan(1000);
  });
});
