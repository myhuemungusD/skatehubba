/**
 * Cart Types
 * 
 * Type definitions for the shopping cart system.
 * 
 * @module lib/cart/types
 */

// ============================================================================
// Core Types
// ============================================================================

/** Unique identifier for cart items */
export type CartItemId = string;

/** Currency amount in dollars */
export type Currency = number;

/** Product category for analytics */
export type ProductCategory = 'gear' | 'apparel' | 'collectible' | 'digital' | 'other';

/**
 * Individual item in the shopping cart
 */
export interface CartItem {
  /** Unique product identifier */
  id: CartItemId;
  /** Display name */
  name: string;
  /** Price per unit in USD */
  price: Currency;
  /** Quantity in cart (minimum 1) */
  quantity: number;
  /** Optional product image URL */
  image?: string;
  /** Optional product category */
  category?: ProductCategory;
  /** Optional SKU for inventory */
  sku?: string;
  /** Optional variant (size, color, etc.) */
  variant?: string;
  /** Optional max quantity (stock limit) */
  maxQuantity?: number;
}

/**
 * Computed cart state snapshot
 */
export interface CartSnapshot {
  /** All items currently in cart */
  items: readonly CartItem[];
  /** Sum of (price × quantity) for all items */
  subtotal: Currency;
  /** Total number of items (sum of quantities) */
  count: number;
  /** Number of unique products */
  uniqueItems: number;
  /** Whether cart has any items */
  isEmpty: boolean;
}

// ============================================================================
// Action Types
// ============================================================================

/** Result of cart operations */
export interface CartOperationResult {
  success: boolean;
  message?: string;
  item?: CartItem;
}

/** Options for adding items */
export interface AddToCartOptions {
  /** Replace quantity instead of adding */
  replaceQuantity?: boolean;
  /** Show toast notification */
  showNotification?: boolean;
}

// ============================================================================
// Store Types
// ============================================================================

/**
 * Cart store state and actions
 */
export interface CartState {
  /** Current cart items */
  items: CartItem[];
  /** Add item to cart */
  add: (item: CartItem, options?: AddToCartOptions) => CartOperationResult;
  /** Remove item from cart */
  remove: (id: CartItemId) => void;
  /** Set quantity for item */
  setQty: (id: CartItemId, qty: number) => void;
  /** Clear all items */
  clear: () => void;
  /** Get computed snapshot */
  snapshot: () => CartSnapshot;
  /** Check if item is in cart */
  hasItem: (id: CartItemId) => boolean;
  /** Get specific item */
  getItem: (id: CartItemId) => CartItem | undefined;
}

// ============================================================================
// Constants
// ============================================================================

/** Minimum quantity for any cart item */
export const MIN_QUANTITY = 1;

/** Maximum quantity per item (unless overridden) */
export const MAX_QUANTITY = 99;

/** localStorage key for cart persistence */
export const CART_STORAGE_KEY = 'skatehubba-cart';

/** Cart version for migration */
export const CART_VERSION = 1;
