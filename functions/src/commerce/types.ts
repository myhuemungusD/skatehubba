/**
 * Commerce Type Definitions
 *
 * TypeScript interfaces for the commerce system.
 */

import { Timestamp } from "firebase-admin/firestore";

export interface CartItem {
  productId: string;
  qty: number;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderItem {
  productId: string;
  qty: number;
  unitPriceCents: number;
}

export type HoldStatus = "held" | "released" | "consumed" | "expired";

export interface HoldDoc {
  uid: string;
  status: HoldStatus;
  items: CartItem[];
  expiresAt: Timestamp;
  createdAt: Timestamp;
  releasedAt?: Timestamp;
  consumedAt?: Timestamp;
  expiredAt?: Timestamp;
}

export type OrderStatus = "pending" | "paid" | "fulfilled" | "refunded" | "canceled";

export interface OrderDoc {
  uid: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  stripePaymentIntentId: string;
  shippingAddress: ShippingAddress;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  paidAt?: Timestamp;
  canceledAt?: Timestamp;
}

export interface ProductDoc {
  name: string;
  priceCents: number;
  currency: string;
  active: boolean;
  shards: number;
  maxPerUser?: number;
}

export interface StockShardDoc {
  available: number;
}

export interface ProcessedEventDoc {
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

export interface HoldAndCreateIntentRequest {
  orderId: string;
  items: CartItem[];
  shippingAddress: ShippingAddress;
}

export interface HoldAndCreateIntentResponse {
  orderId: string;
  holdStatus: HoldStatus;
  expiresAt: string;
  paymentIntentClientSecret: string;
}
