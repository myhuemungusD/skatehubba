import "../types";
import type {
  CartItem,
  ShippingAddress,
  OrderItem,
  HoldStatus,
  HoldDoc,
  OrderStatus,
  OrderDoc,
  ProductDoc,
  StockShardDoc,
  ProcessedEventDoc,
  HoldAndCreateIntentRequest,
  HoldAndCreateIntentResponse,
} from "../types";

describe("Commerce Types", () => {
  it("allows constructing CartItem and OrderItem", () => {
    const cartItem: CartItem = { productId: "prod-001", qty: 2 };
    const orderItem: OrderItem = {
      productId: "prod-001",
      qty: 2,
      unitPriceCents: 2999,
    };
    expect(cartItem.qty).toBe(2);
    expect(orderItem.unitPriceCents).toBe(2999);
  });

  it("allows constructing a ShippingAddress", () => {
    const address: ShippingAddress = {
      name: "Tony Hawk",
      line1: "123 Skatepark Ave",
      city: "San Diego",
      state: "CA",
      postalCode: "92101",
      country: "US",
    };
    expect(address.city).toBe("San Diego");
  });

  it("supports all HoldStatus values", () => {
    const statuses: HoldStatus[] = ["held", "released", "consumed", "expired"];
    expect(statuses).toHaveLength(4);
  });

  it("supports all OrderStatus values", () => {
    const statuses: OrderStatus[] = [
      "pending",
      "paid",
      "fulfilled",
      "refunded",
      "disputed",
      "canceled",
    ];
    expect(statuses).toHaveLength(6);
  });

  it("allows constructing a ProductDoc", () => {
    const product: ProductDoc = {
      name: "Skateboard Deck",
      priceCents: 5999,
      currency: "usd",
      active: true,
      shards: 5,
      maxPerUser: 3,
    };
    expect(product.priceCents).toBe(5999);
    expect(product.active).toBe(true);
  });

  it("allows constructing a StockShardDoc", () => {
    const shard: StockShardDoc = { available: 42 };
    expect(shard.available).toBe(42);
  });

  it("allows constructing HoldAndCreateIntentRequest/Response", () => {
    const request: HoldAndCreateIntentRequest = {
      orderId: "order-001",
      items: [{ productId: "prod-001", qty: 1 }],
      shippingAddress: {
        name: "Tony Hawk",
        line1: "123 Skatepark Ave",
        city: "San Diego",
        state: "CA",
        postalCode: "92101",
        country: "US",
      },
    };

    const response: HoldAndCreateIntentResponse = {
      orderId: "order-001",
      holdStatus: "held",
      expiresAt: "2025-01-01T01:00:00Z",
      paymentIntentClientSecret: "pi_secret_abc123",
    };

    expect(request.items).toHaveLength(1);
    expect(response.holdStatus).toBe("held");
  });
});
