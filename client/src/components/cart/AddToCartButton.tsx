/**
 * AddToCartButton Component
 * 
 * Reusable button for adding products to the shopping cart.
 * Features: loading state, quantity support, accessibility, analytics.
 * 
 * @module components/cart/AddToCartButton
 */

import { useState, useCallback, memo } from 'react';
import { ShoppingCart, Check, Loader2 } from 'lucide-react';
import { useCart } from '../../lib/cart/store';
import type { CartItem, ProductCategory } from '../../lib/cart/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface AddToCartButtonProps {
  /** Product ID */
  id: string;
  /** Product name */
  name: string;
  /** Price per unit */
  price: number;
  /** Initial quantity to add (default: 1) */
  quantity?: number;
  /** Product image URL */
  image?: string;
  /** Product category for analytics */
  category?: ProductCategory;
  /** Product SKU */
  sku?: string;
  /** Variant (size, color) */
  variant?: string;
  /** Max quantity allowed */
  maxQuantity?: number;
  /** Button size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Full width button */
  fullWidth?: boolean;
  /** Show icon */
  showIcon?: boolean;
  /** Custom button text */
  text?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Callback after adding */
  onAdd?: (item: CartItem) => void;
}

// ============================================================================
// Styles
// ============================================================================

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3 text-lg',
} as const;

const iconSizes = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
} as const;

// ============================================================================
// Component
// ============================================================================

function AddToCartButtonComponent({
  id,
  name,
  price,
  quantity = 1,
  image,
  category,
  sku,
  variant,
  maxQuantity,
  size = 'md',
  fullWidth = false,
  showIcon = true,
  text = 'Add to Cart',
  disabled = false,
  className,
  onAdd,
}: AddToCartButtonProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  
  const add = useCart((s) => s.add);
  const hasItem = useCart((s) => s.hasItem);
  const { toast } = useToast();

  const isInCart = hasItem(id);

  const handleAddToCart = useCallback(async () => {
    if (disabled || isAdding) return;

    setIsAdding(true);

    // Simulate network delay for better UX feedback
    await new Promise((resolve) => setTimeout(resolve, 150));

    const item: CartItem = {
      id,
      name,
      price,
      quantity: Math.max(1, quantity),
      image,
      category,
      sku,
      variant,
      maxQuantity,
    };

    const result = add(item);

    if (result.success) {
      setJustAdded(true);
      
      toast({
        title: isInCart ? 'Updated cart! 🛒' : 'Added to cart! 🛹',
        description: result.message,
        duration: 3000,
      });

      onAdd?.(item);

      // Reset "just added" state after animation
      setTimeout(() => setJustAdded(false), 2000);
    } else {
      toast({
        title: 'Could not add to cart',
        description: result.message || 'Please try again.',
        variant: 'destructive',
        duration: 3000,
      });
    }

    setIsAdding(false);
  }, [id, name, price, quantity, image, category, sku, variant, maxQuantity, disabled, isAdding, add, toast, isInCart, onAdd]);

  const buttonText = justAdded ? 'Added!' : isInCart ? 'Add More' : text;

  const Icon = justAdded ? Check : isAdding ? Loader2 : ShoppingCart;

  return (
    <button
      onClick={handleAddToCart}
      disabled={disabled || isAdding}
      data-testid={`button-add-to-cart-${id}`}
      aria-label={`Add ${name} to cart`}
      className={cn(
        // Base styles
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all',
        // Colors
        'bg-orange-600 text-white',
        'hover:bg-orange-700 active:bg-orange-800',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        // Focus
        'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900',
        // Size
        sizeStyles[size],
        // Width
        fullWidth && 'w-full',
        // Success state
        justAdded && 'bg-green-600 hover:bg-green-600',
        // Custom
        className
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            iconSizes[size],
            isAdding && 'animate-spin'
          )}
        />
      )}
      <span>{buttonText}</span>
    </button>
  );
}

// Memoize to prevent unnecessary re-renders
const AddToCartButton = memo(AddToCartButtonComponent);
AddToCartButton.displayName = 'AddToCartButton';

export default AddToCartButton;
