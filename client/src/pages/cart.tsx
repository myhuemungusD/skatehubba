/**
 * CartPage Component
 * 
 * Full-page cart view with quantity controls and checkout.
 * Features: responsive table layout, accessibility, mobile-first design.
 * 
 * @module pages/cart
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { 
  ShoppingCart, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowLeft, 
  ShieldCheck,
  Package,
  RefreshCw,
  CreditCard,
} from 'lucide-react';
import { useCart, selectCartCount, selectCartSubtotal } from '../lib/cart';
import type { CartItem } from '../lib/cart';
import { MAX_QUANTITY, MIN_QUANTITY } from '../lib/cart/types';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface CartItemRowProps {
  item: CartItem;
  onRemove: (id: string) => void;
  onQuantityChange: (id: string, qty: number) => void;
}

// ============================================================================
// Sub-components
// ============================================================================

const CartItemRow = memo(function CartItemRow({
  item,
  onRemove,
  onQuantityChange,
}: CartItemRowProps) {
  const lineTotal = useMemo(() => item.price * item.quantity, [item.price, item.quantity]);
  const maxQty = item.maxQuantity ?? MAX_QUANTITY;

  return (
    <tr className="border-t border-gray-700" data-testid={`cart-row-${item.id}`}>
      {/* Product */}
      <td className="py-4 px-6">
        <div className="flex items-center gap-4">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="h-16 w-16 object-cover rounded-lg flex-shrink-0"
              loading="lazy"
            />
          ) : (
            <div className="h-16 w-16 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
              <ShoppingCart className="w-6 h-6 text-gray-500" />
            </div>
          )}
          <div className="min-w-0">
            <span className="font-medium block truncate">{item.name}</span>
            {item.variant && (
              <span className="text-xs text-gray-400">{item.variant}</span>
            )}
            {/* Mobile price */}
            <span className="text-sm text-orange-500 font-semibold sm:hidden mt-1 block">
              ${item.price.toFixed(2)}
            </span>
          </div>
        </div>
      </td>

      {/* Price (desktop) */}
      <td className="py-4 px-6 text-center hidden sm:table-cell">
        <span className="text-orange-500 font-semibold">${item.price.toFixed(2)}</span>
      </td>

      {/* Quantity */}
      <td className="py-4 px-6">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => onQuantityChange(item.id, item.quantity - 1)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Decrease quantity"
            disabled={item.quantity <= MIN_QUANTITY}
            data-testid={`button-decrease-quantity-${item.id}`}
          >
            <Minus className="w-4 h-4" />
          </button>
          <input
            type="number"
            min={MIN_QUANTITY}
            max={maxQty}
            value={item.quantity}
            onChange={(e) => onQuantityChange(item.id, Number(e.target.value))}
            className="w-20 rounded-lg bg-gray-700 border border-gray-600 px-3 py-2 text-center focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            aria-label={`Quantity for ${item.name}`}
            data-testid={`input-quantity-${item.id}`}
          />
          <button
            onClick={() => onQuantityChange(item.id, item.quantity + 1)}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Increase quantity"
            disabled={item.quantity >= maxQty}
            data-testid={`button-increase-quantity-${item.id}`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </td>

      {/* Line Total (desktop) */}
      <td
        className="py-4 px-6 text-center font-semibold hidden sm:table-cell"
        data-testid={`cart-item-total-${item.id}`}
      >
        ${lineTotal.toFixed(2)}
      </td>

      {/* Remove */}
      <td className="py-4 px-6 text-center">
        <button
          onClick={() => onRemove(item.id)}
          className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
          aria-label={`Remove ${item.name} from cart`}
          data-testid={`button-remove-${item.id}`}
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </td>
    </tr>
  );
});

const TrustBadges = memo(function TrustBadges() {
  return (
    <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400 mt-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-green-500" />
        <span>Secure Checkout</span>
      </div>
      <div className="flex items-center gap-2">
        <Package className="w-5 h-5 text-blue-400" />
        <span>Fast Shipping</span>
      </div>
      <div className="flex items-center gap-2">
        <RefreshCw className="w-5 h-5 text-orange-400" />
        <span>30-Day Returns</span>
      </div>
    </div>
  );
});

const EmptyCartState = memo(function EmptyCartState() {
  return (
    <div className="text-center py-20" data-testid="cart-page-empty">
      <ShoppingCart className="w-24 h-24 mx-auto text-gray-600 mb-6" />
      <h2 className="text-xl font-semibold text-white mb-2">Your cart is empty</h2>
      <p className="text-gray-400 mb-8">
        Looks like you haven't added any gear yet.
      </p>
      <Link
        href="/shop"
        className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 px-6 py-3 rounded-lg font-semibold transition-colors"
        data-testid="link-continue-shopping"
      >
        <ShoppingCart className="w-5 h-5" />
        Start Shopping
      </Link>
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

function CartPageComponent() {
  const { snapshot, remove, setQty, clear } = useCart();
  const count = useCart(selectCartCount);
  const subtotal = useCart(selectCartSubtotal);
  const snap = snapshot();

  const [isClearing, setIsClearing] = useState(false);

  const handleClear = useCallback(() => {
    if (window.confirm('Are you sure you want to clear your cart?')) {
      setIsClearing(true);
      clear();
      // Small delay for UX feedback
      setTimeout(() => setIsClearing(false), 300);
    }
  }, [clear]);

  const handleQuantityChange = useCallback(
    (id: string, qty: number) => {
      if (qty < MIN_QUANTITY) {
        remove(id);
      } else {
        setQty(id, qty);
      }
    },
    [remove, setQty]
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="mx-auto max-w-4xl p-6">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 text-orange-500 hover:text-orange-400 mb-4 transition-colors"
            data-testid="link-back-to-shop"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Shop
          </Link>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <ShoppingCart className="w-8 h-8" />
            Shopping Cart
            {count > 0 && (
              <span className="text-lg font-normal text-gray-400">
                ({count} {count === 1 ? 'item' : 'items'})
              </span>
            )}
          </h1>
        </div>

        {snap.isEmpty ? (
          <EmptyCartState />
        ) : (
          <>
            {/* Cart Table */}
            <div className="bg-gray-800 rounded-lg overflow-hidden mb-6 overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="py-4 px-6 text-left font-semibold">Product</th>
                    <th className="py-4 px-6 text-center font-semibold hidden sm:table-cell">Price</th>
                    <th className="py-4 px-6 text-center font-semibold">Quantity</th>
                    <th className="py-4 px-6 text-center font-semibold hidden sm:table-cell">Total</th>
                    <th className="py-4 px-6 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {snap.items.map((item) => (
                    <CartItemRow
                      key={item.id}
                      item={item}
                      onRemove={remove}
                      onQuantityChange={handleQuantityChange}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary & Checkout */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <button
                  onClick={handleClear}
                  disabled={isClearing}
                  className={cn(
                    'flex items-center gap-2 text-red-500 hover:text-red-400 transition-colors',
                    isClearing && 'opacity-50 cursor-not-allowed'
                  )}
                  data-testid="button-clear-cart"
                >
                  <Trash2 className={cn('w-5 h-5', isClearing && 'animate-spin')} />
                  {isClearing ? 'Clearing...' : 'Clear cart'}
                </button>

                <div className="text-right">
                  <div className="text-sm text-gray-400 mb-1">
                    Subtotal ({snap.uniqueItems} {snap.uniqueItems === 1 ? 'product' : 'products'})
                  </div>
                  <div className="text-3xl font-bold text-white" data-testid="cart-subtotal">
                    ${subtotal.toFixed(2)}
                  </div>
                </div>
              </div>

              <div
                className="flex flex-col items-center justify-center gap-2 w-full text-center rounded-lg bg-gray-700 text-gray-400 px-6 py-4 cursor-not-allowed"
                data-testid="button-pay-now-disabled"
              >
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <CreditCard className="w-5 h-5" />
                  Checkout Coming Soon
                </div>
                <span className="text-sm">Payment processing will be available soon!</span>
              </div>

              <TrustBadges />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const CartPage = memo(CartPageComponent);
CartPage.displayName = 'CartPage';

export default CartPage;
