/**
 * Cart Module
 * 
 * Shopping cart state management and utilities.
 * 
 * @module lib/cart
 * 
 * @example
 * ```tsx
 * import { useCart, type CartItem } from '@/lib/cart';
 * 
 * function MyComponent() {
 *   const { add, remove, snapshot } = useCart();
 *   const { items, subtotal, count } = snapshot();
 *   // ...
 * }
 * ```
 */

// Store
export { useCart, selectCartCount, selectCartSubtotal, selectCartIsEmpty } from './store';

// Types
export type {
  CartItem,
  CartItemId,
  CartSnapshot,
  CartState,
  CartOperationResult,
  AddToCartOptions,
  ProductCategory,
  Currency,
} from './types';

// Constants
export {
  MIN_QUANTITY,
  MAX_QUANTITY,
  CART_STORAGE_KEY,
  CART_VERSION,
} from './types';
