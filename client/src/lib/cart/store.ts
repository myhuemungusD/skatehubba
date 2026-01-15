/**
 * Cart Store
 * 
 * Zustand store for shopping cart state management.
 * Features: persistence, computed snapshots, optimistic updates.
 * 
 * @module lib/cart/store
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  CartItem,
  CartItemId,
  CartSnapshot,
  CartState,
  CartOperationResult,
  AddToCartOptions,
} from './types';
import {
  MIN_QUANTITY,
  MAX_QUANTITY,
  CART_STORAGE_KEY,
  CART_VERSION,
} from './types';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Clamp quantity within valid range
 */
function clampQuantity(qty: number, max: number = MAX_QUANTITY): number {
  return Math.max(MIN_QUANTITY, Math.min(max, Math.round(qty)));
}

/**
 * Calculate cart totals
 */
function calculateTotals(items: CartItem[]): Pick<CartSnapshot, 'subtotal' | 'count' | 'uniqueItems'> {
  return items.reduce(
    (acc, item) => ({
      subtotal: acc.subtotal + item.price * item.quantity,
      count: acc.count + item.quantity,
      uniqueItems: acc.uniqueItems + 1,
    }),
    { subtotal: 0, count: 0, uniqueItems: 0 }
  );
}

// ============================================================================
// Store
// ============================================================================

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      /**
       * Add item to cart
       * - If exists: increment quantity
       * - If new: add to items array
       */
      add: (item: CartItem, options?: AddToCartOptions): CartOperationResult => {
        const { items } = get();
        const existing = items.find((i) => i.id === item.id);
        const maxQty = item.maxQuantity ?? MAX_QUANTITY;

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

      /**
       * Remove item from cart by ID
       */
      remove: (id: CartItemId): void => {
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        }));
      },

      /**
       * Set quantity for specific item
       * - Removes item if quantity <= 0
       * - Clamps to valid range
       */
      setQty: (id: CartItemId, qty: number): void => {
        if (qty <= 0) {
          get().remove(id);
          return;
        }

        set((state) => ({
          items: state.items.map((i) => {
            if (i.id !== id) return i;
            const maxQty = i.maxQuantity ?? MAX_QUANTITY;
            return { ...i, quantity: clampQuantity(qty, maxQty) };
          }),
        }));
      },

      /**
       * Clear all items from cart
       */
      clear: (): void => {
        set({ items: [] });
      },

      /**
       * Get computed cart snapshot
       * Immutable view of current state with totals
       */
      snapshot: (): CartSnapshot => {
        const items = get().items;
        const totals = calculateTotals(items);

        return {
          items: Object.freeze([...items]) as readonly CartItem[],
          subtotal: Math.round(totals.subtotal * 100) / 100, // Fix floating point
          count: totals.count,
          uniqueItems: totals.uniqueItems,
          isEmpty: items.length === 0,
        };
      },

      /**
       * Check if item exists in cart
       */
      hasItem: (id: CartItemId): boolean => {
        return get().items.some((i) => i.id === id);
      },

      /**
       * Get specific item by ID
       */
      getItem: (id: CartItemId): CartItem | undefined => {
        return get().items.find((i) => i.id === id);
      },
    }),
    {
      name: CART_STORAGE_KEY,
      version: CART_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Migrate old cart data if version changes
      migrate: (persistedState, version) => {
        if (version === 0) {
          // Migration from version 0 to 1
          return persistedState as CartState;
        }
        return persistedState as CartState;
      },
    }
  )
);

// ============================================================================
// Selectors (for performance optimization)
// ============================================================================

/**
 * Select just the item count (avoids re-renders)
 */
export const selectCartCount = (state: CartState): number => {
  return state.items.reduce((sum, i) => sum + i.quantity, 0);
};

/**
 * Select subtotal only
 */
export const selectCartSubtotal = (state: CartState): number => {
  return state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
};

/**
 * Select whether cart is empty
 */
export const selectCartIsEmpty = (state: CartState): boolean => {
  return state.items.length === 0;
};
