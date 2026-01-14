/**
 * CartDrawer Component
 * 
 * Slide-out drawer showing cart contents with quantity controls.
 * Features: keyboard navigation, accessibility, smooth animations.
 * 
 * @module components/cart/CartDrawer
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingCart, X, Minus, Plus, Trash2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { useCart, selectCartCount } from '../../lib/cart/store';
import type { CartItem } from '../../lib/cart/types';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface CartDrawerProps {
  /** Custom trigger button (renders default if not provided) */
  trigger?: React.ReactNode;
  /** Additional class for trigger button */
  triggerClassName?: string;
}

// ============================================================================
// Sub-components
// ============================================================================

interface CartItemRowProps {
  item: CartItem;
  onRemove: (id: string) => void;
  onQuantityChange: (id: string, qty: number) => void;
}

const CartItemRow = memo(function CartItemRow({
  item,
  onRemove,
  onQuantityChange,
}: CartItemRowProps) {
  return (
    <li
      className="flex gap-4 bg-gray-800 p-4 rounded-lg"
      data-testid={`cart-item-${item.id}`}
    >
      {/* Image */}
      {item.image ? (
        <img
          src={item.image}
          alt={item.name}
          className="h-20 w-20 object-cover rounded-lg flex-shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="h-20 w-20 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
          <ShoppingCart className="w-8 h-8 text-gray-500" />
        </div>
      )}

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start mb-2">
          <p className="font-medium text-white truncate pr-2">{item.name}</p>
          <button
            onClick={() => onRemove(item.id)}
            className="text-red-500 hover:text-red-400 transition-colors p-1 -mr-1"
            aria-label={`Remove ${item.name} from cart`}
            data-testid={`button-remove-${item.id}`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Variant if present */}
        {item.variant && (
          <p className="text-xs text-gray-400 mb-1">{item.variant}</p>
        )}

        <p className="text-sm text-orange-500 font-semibold mb-3">
          ${item.price.toFixed(2)}
        </p>

        {/* Quantity controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onQuantityChange(item.id, item.quantity - 1)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            aria-label="Decrease quantity"
            disabled={item.quantity <= 1}
            data-testid={`button-decrease-quantity-${item.id}`}
          >
            <Minus className="w-4 h-4 text-white" />
          </button>
          <input
            type="number"
            min={1}
            max={item.maxQuantity ?? 99}
            value={item.quantity}
            onChange={(e) => onQuantityChange(item.id, Number(e.target.value))}
            className="w-16 rounded-lg bg-gray-700 border border-gray-600 px-3 py-1.5 text-sm text-white text-center focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            aria-label={`Quantity for ${item.name}`}
            data-testid={`input-quantity-${item.id}`}
          />
          <button
            onClick={() => onQuantityChange(item.id, item.quantity + 1)}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            aria-label="Increase quantity"
            disabled={item.maxQuantity ? item.quantity >= item.maxQuantity : false}
            data-testid={`button-increase-quantity-${item.id}`}
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </li>
  );
});

// ============================================================================
// Main Component
// ============================================================================

function CartDrawerComponent({ trigger, triggerClassName }: CartDrawerProps) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Use selectors for performance
  const count = useCart(selectCartCount);
  const { snapshot, remove, setQty, clear } = useCart();
  const snap = snapshot();

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // Focus trap
  useEffect(() => {
    if (!open || !panelRef.current) return;

    const focusableElements = panelRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }

    // Focus first element on open
    firstElement?.focus();

    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [open]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const goToCheckout = useCallback(() => {
    setOpen(false);
    setLocation('/cart');
  }, [setLocation]);

  const handleClear = useCallback(() => {
    if (window.confirm('Are you sure you want to clear your cart?')) {
      clear();
    }
  }, [clear]);

  // Drawer content (portaled to body)
  const drawerContent = open ? (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Shopping cart">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => setOpen(false)}
        aria-hidden="true"
        data-testid="cart-drawer-overlay"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="absolute right-0 top-0 h-full w-full max-w-md bg-gray-900 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300"
        data-testid="cart-drawer"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-6 h-6" />
            Your Cart
            {count > 0 && (
              <span className="text-sm font-normal text-gray-400">
                ({count} {count === 1 ? 'item' : 'items'})
              </span>
            )}
          </h2>
          <button
            onClick={() => setOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Close cart"
            data-testid="button-close-cart-drawer"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {snap.isEmpty ? (
            <div className="text-center py-12" data-testid="cart-drawer-empty">
              <ShoppingCart className="w-16 h-16 mx-auto text-gray-600 mb-4" />
              <p className="text-gray-400 mb-2">Your cart is empty.</p>
              <p className="text-sm text-gray-500">Add some gear to get started!</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {snap.items.map((item) => (
                <CartItemRow
                  key={item.id}
                  item={item}
                  onRemove={remove}
                  onQuantityChange={setQty}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {!snap.isEmpty && (
          <div className="border-t border-gray-800 p-6">
            <div className="flex justify-between text-lg mb-6">
              <span className="text-gray-400">Subtotal</span>
              <span className="font-bold text-white" data-testid="cart-drawer-subtotal">
                ${snap.subtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleClear}
                className="flex-1 rounded-lg border border-gray-600 px-4 py-3 hover:bg-gray-800 transition-colors text-white"
                data-testid="button-clear-cart"
              >
                Clear
              </button>
              <button
                onClick={goToCheckout}
                className="flex-[2] text-center rounded-lg bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 font-semibold transition-colors"
                data-testid="button-checkout"
              >
                Checkout
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* Trigger */}
      {trigger || (
        <button
          ref={triggerRef}
          aria-label={`Open cart${count > 0 ? `, ${count} items` : ''}`}
          aria-haspopup="dialog"
          onClick={() => setOpen(true)}
          data-testid="button-open-cart"
          className={cn(
            'relative inline-flex items-center gap-2 rounded-lg border border-orange-600 px-4 py-2 hover:bg-orange-600/10 transition-colors',
            triggerClassName
          )}
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="hidden sm:inline">Cart</span>
          {count > 0 && (
            <span
              className="absolute -top-2 -right-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-orange-600 text-white text-xs font-bold px-1.5 animate-in zoom-in duration-200"
              data-testid="cart-badge-count"
            >
              {count}
            </span>
          )}
        </button>
      )}

      {/* Portal drawer to body */}
      {typeof document !== 'undefined' && createPortal(drawerContent, document.body)}
    </>
  );
}

const CartDrawer = memo(CartDrawerComponent);
CartDrawer.displayName = 'CartDrawer';

export default CartDrawer;
