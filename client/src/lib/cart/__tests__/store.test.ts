/**
 * @fileoverview Unit tests for Cart Store
 * @module client/src/lib/cart/__tests__/store.test
 * 
 * Tests Zustand cart store operations including add, remove, quantity updates,
 * and computed selectors. Uses isolated store instances for each test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { create } from 'zustand';
import type { CartItem, CartState, CartSnapshot } from '../types';
import { MIN_QUANTITY, MAX_QUANTITY } from '../types';

// =============================================================================
// Test Store Factory
// =============================================================================

/**
 * Create an isolated cart store for testing (no persistence)
 * This avoids localStorage side effects between tests
 */
function createTestStore() {
  return create<CartState>()((set, get) => ({
    items: [],

    add: (item: CartItem, options) => {
      const { items } = get();
      const existing = items.find((i) => i.id === item.id);
      const maxQty = item.maxQuantity ?? MAX_QUANTITY;

      const clampQuantity = (qty: number, max: number = MAX_QUANTITY): number =>
        Math.max(MIN_QUANTITY, Math.min(max, Math.round(qty)));

      if (existing) {
        const newQty = options?.replaceQuantity
          ? clampQuantity(item.quantity, maxQty)
          : clampQuantity(existing.quantity + item.quantity, maxQty);

        set({
          items: items.map((i) =>
            i.id === item.id ? { ...i, quantity: newQty } : i
          ),
        });

        return {
          success: true,
          message: `Updated ${item.name} quantity to ${newQty}`,
          item: { ...existing, quantity: newQty },
        };
      }

      const newItem: CartItem = {
        ...item,
        quantity: clampQuantity(item.quantity, maxQty),
      };

      set({ items: [...items, newItem] });

      return {
        success: true,
        message: `Added ${item.name} to cart`,
        item: newItem,
      };
    },

    remove: (id) => {
      set((state) => ({
        items: state.items.filter((i) => i.id !== id),
      }));
    },

    setQty: (id, qty) => {
      if (qty <= 0) {
        get().remove(id);
        return;
      }

      const clampQuantity = (q: number, max: number = MAX_QUANTITY): number =>
        Math.max(MIN_QUANTITY, Math.min(max, Math.round(q)));

      set((state) => ({
        items: state.items.map((i) => {
          if (i.id !== id) return i;
          const maxQty = i.maxQuantity ?? MAX_QUANTITY;
          return { ...i, quantity: clampQuantity(qty, maxQty) };
        }),
      }));
    },

    clear: () => {
      set({ items: [] });
    },

    snapshot: (): CartSnapshot => {
      const items = get().items;
      const totals = items.reduce(
        (acc, item) => ({
          subtotal: acc.subtotal + item.price * item.quantity,
          count: acc.count + item.quantity,
          uniqueItems: acc.uniqueItems + 1,
        }),
        { subtotal: 0, count: 0, uniqueItems: 0 }
      );

      return {
        items: Object.freeze([...items]) as readonly CartItem[],
        subtotal: Math.round(totals.subtotal * 100) / 100,
        count: totals.count,
        uniqueItems: totals.uniqueItems,
        isEmpty: items.length === 0,
      };
    },

    hasItem: (id) => get().items.some((i) => i.id === id),

    getItem: (id) => get().items.find((i) => i.id === id),
  }));
}

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: 'test-item-1',
  name: 'Test Skateboard',
  price: 99.99,
  quantity: 1,
  image: '/images/board.jpg',
  ...overrides,
});

// =============================================================================
// ADD ITEM TESTS
// =============================================================================

describe('Cart Store - add()', () => {
  let useStore: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    useStore = createTestStore();
  });

  it('should add a new item to empty cart', () => {
    const item = createMockItem();
    const result = useStore.getState().add(item);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Added');
    expect(useStore.getState().items).toHaveLength(1);
    expect(useStore.getState().items[0]).toEqual(item);
  });

  it('should increment quantity when adding existing item', () => {
    const item = createMockItem();
    useStore.getState().add(item);
    useStore.getState().add(item);

    expect(useStore.getState().items).toHaveLength(1);
    expect(useStore.getState().items[0].quantity).toBe(2);
  });

  it('should replace quantity when replaceQuantity option is true', () => {
    const item = createMockItem({ quantity: 3 });
    useStore.getState().add(item);
    useStore.getState().add({ ...item, quantity: 5 }, { replaceQuantity: true });

    expect(useStore.getState().items[0].quantity).toBe(5);
  });

  it('should clamp quantity to MIN_QUANTITY', () => {
    const item = createMockItem({ quantity: 0 });
    useStore.getState().add(item);

    expect(useStore.getState().items[0].quantity).toBe(MIN_QUANTITY);
  });

  it('should clamp quantity to MAX_QUANTITY', () => {
    const item = createMockItem({ quantity: 1000 });
    useStore.getState().add(item);

    expect(useStore.getState().items[0].quantity).toBe(MAX_QUANTITY);
  });

  it('should respect item-specific maxQuantity', () => {
    const item = createMockItem({ quantity: 10, maxQuantity: 5 });
    useStore.getState().add(item);

    expect(useStore.getState().items[0].quantity).toBe(5);
  });

  it('should handle multiple unique items', () => {
    useStore.getState().add(createMockItem({ id: 'item-1', name: 'Board A' }));
    useStore.getState().add(createMockItem({ id: 'item-2', name: 'Board B' }));
    useStore.getState().add(createMockItem({ id: 'item-3', name: 'Board C' }));

    expect(useStore.getState().items).toHaveLength(3);
  });
});

// =============================================================================
// REMOVE ITEM TESTS
// =============================================================================

describe('Cart Store - remove()', () => {
  let useStore: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    useStore = createTestStore();
  });

  it('should remove item by ID', () => {
    useStore.getState().add(createMockItem({ id: 'item-1' }));
    useStore.getState().add(createMockItem({ id: 'item-2' }));

    useStore.getState().remove('item-1');

    expect(useStore.getState().items).toHaveLength(1);
    expect(useStore.getState().items[0].id).toBe('item-2');
  });

  it('should do nothing when removing non-existent item', () => {
    useStore.getState().add(createMockItem({ id: 'item-1' }));

    useStore.getState().remove('non-existent');

    expect(useStore.getState().items).toHaveLength(1);
  });

  it('should handle removing from empty cart', () => {
    useStore.getState().remove('any-id');

    expect(useStore.getState().items).toHaveLength(0);
  });
});

// =============================================================================
// SET QUANTITY TESTS
// =============================================================================

describe('Cart Store - setQty()', () => {
  let useStore: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    useStore = createTestStore();
  });

  it('should update quantity for existing item', () => {
    useStore.getState().add(createMockItem({ id: 'item-1' }));

    useStore.getState().setQty('item-1', 5);

    expect(useStore.getState().items[0].quantity).toBe(5);
  });

  it('should remove item when quantity is set to 0', () => {
    useStore.getState().add(createMockItem({ id: 'item-1' }));

    useStore.getState().setQty('item-1', 0);

    expect(useStore.getState().items).toHaveLength(0);
  });

  it('should remove item when quantity is negative', () => {
    useStore.getState().add(createMockItem({ id: 'item-1' }));

    useStore.getState().setQty('item-1', -5);

    expect(useStore.getState().items).toHaveLength(0);
  });

  it('should clamp quantity to MAX_QUANTITY', () => {
    useStore.getState().add(createMockItem({ id: 'item-1' }));

    useStore.getState().setQty('item-1', 1000);

    expect(useStore.getState().items[0].quantity).toBe(MAX_QUANTITY);
  });

  it('should round fractional quantities', () => {
    useStore.getState().add(createMockItem({ id: 'item-1' }));

    useStore.getState().setQty('item-1', 3.7);

    expect(useStore.getState().items[0].quantity).toBe(4);
  });
});

// =============================================================================
// CLEAR CART TESTS
// =============================================================================

describe('Cart Store - clear()', () => {
  let useStore: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    useStore = createTestStore();
  });

  it('should remove all items', () => {
    useStore.getState().add(createMockItem({ id: 'item-1' }));
    useStore.getState().add(createMockItem({ id: 'item-2' }));
    useStore.getState().add(createMockItem({ id: 'item-3' }));

    useStore.getState().clear();

    expect(useStore.getState().items).toHaveLength(0);
  });

  it('should handle clearing empty cart', () => {
    useStore.getState().clear();

    expect(useStore.getState().items).toHaveLength(0);
  });
});

// =============================================================================
// SNAPSHOT TESTS
// =============================================================================

describe('Cart Store - snapshot()', () => {
  let useStore: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    useStore = createTestStore();
  });

  it('should return correct totals for empty cart', () => {
    const snap = useStore.getState().snapshot();

    expect(snap.isEmpty).toBe(true);
    expect(snap.count).toBe(0);
    expect(snap.subtotal).toBe(0);
    expect(snap.uniqueItems).toBe(0);
  });

  it('should calculate correct subtotal', () => {
    useStore.getState().add(createMockItem({ id: 'item-1', price: 10, quantity: 2 }));
    useStore.getState().add(createMockItem({ id: 'item-2', price: 25, quantity: 1 }));

    const snap = useStore.getState().snapshot();

    expect(snap.subtotal).toBe(45); // (10 * 2) + (25 * 1)
  });

  it('should calculate correct item count', () => {
    useStore.getState().add(createMockItem({ id: 'item-1', quantity: 3 }));
    useStore.getState().add(createMockItem({ id: 'item-2', quantity: 2 }));

    const snap = useStore.getState().snapshot();

    expect(snap.count).toBe(5);
    expect(snap.uniqueItems).toBe(2);
  });

  it('should handle floating point precision', () => {
    useStore.getState().add(createMockItem({ id: 'item-1', price: 0.1, quantity: 3 }));

    const snap = useStore.getState().snapshot();

    // Should not have floating point errors like 0.30000000000000004
    expect(snap.subtotal).toBe(0.3);
  });

  it('should return frozen items array', () => {
    useStore.getState().add(createMockItem({ id: 'item-1' }));

    const snap = useStore.getState().snapshot();

    expect(Object.isFrozen(snap.items)).toBe(true);
  });
});

// =============================================================================
// HELPER METHOD TESTS
// =============================================================================

describe('Cart Store - hasItem() and getItem()', () => {
  let useStore: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    useStore = createTestStore();
  });

  it('hasItem should return true for existing item', () => {
    useStore.getState().add(createMockItem({ id: 'exists' }));

    expect(useStore.getState().hasItem('exists')).toBe(true);
  });

  it('hasItem should return false for non-existing item', () => {
    expect(useStore.getState().hasItem('does-not-exist')).toBe(false);
  });

  it('getItem should return item for existing ID', () => {
    const item = createMockItem({ id: 'test-id', name: 'Special Board' });
    useStore.getState().add(item);

    const result = useStore.getState().getItem('test-id');

    expect(result).toBeDefined();
    expect(result?.name).toBe('Special Board');
  });

  it('getItem should return undefined for non-existing ID', () => {
    const result = useStore.getState().getItem('does-not-exist');

    expect(result).toBeUndefined();
  });
});
