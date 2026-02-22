import "../../storage/types";
import type { CreateSubscriber, SubscriberRepo } from "../../storage/types";

describe("Storage Types", () => {
  it("allows constructing a CreateSubscriber", () => {
    const subscriber: CreateSubscriber = {
      email: "skater@example.com",
      firstName: "Tony",
      isActive: true,
    };
    expect(subscriber.email).toBe("skater@example.com");
    expect(subscriber.isActive).toBe(true);
  });

  it("allows CreateSubscriber with null firstName", () => {
    const subscriber: CreateSubscriber = {
      email: "anon@example.com",
      firstName: null,
    };
    expect(subscriber.firstName).toBeNull();
  });

  it("allows implementing SubscriberRepo interface", () => {
    const mockRepo: SubscriberRepo = {
      getSubscriberByEmail: async (email: string) => null,
      createSubscriber: async (data: CreateSubscriber) =>
        ({
          id: 1,
          email: data.email,
          firstName: data.firstName,
          isActive: data.isActive ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }) as any,
    };

    expect(mockRepo.getSubscriberByEmail).toBeDefined();
    expect(mockRepo.createSubscriber).toBeDefined();
  });
});
