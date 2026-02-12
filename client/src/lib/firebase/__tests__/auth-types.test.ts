import { toAuthUser } from "../auth.types";

describe("toAuthUser", () => {
  it("extracts auth fields from a firebase user object", () => {
    const firebaseUser = {
      uid: "user-123",
      email: "skater@example.com",
      displayName: "Tony Hawk",
      photoURL: "https://cdn.example.com/avatar.jpg",
      emailVerified: true,
    };

    const result = toAuthUser(firebaseUser as any);

    expect(result).toEqual({
      uid: "user-123",
      email: "skater@example.com",
      displayName: "Tony Hawk",
      photoURL: "https://cdn.example.com/avatar.jpg",
      emailVerified: true,
    });
  });

  it("handles null optional fields", () => {
    const firebaseUser = {
      uid: "user-456",
      email: null,
      displayName: null,
      photoURL: null,
      emailVerified: false,
    };

    const result = toAuthUser(firebaseUser as any);

    expect(result.uid).toBe("user-456");
    expect(result.email).toBeNull();
    expect(result.displayName).toBeNull();
    expect(result.photoURL).toBeNull();
    expect(result.emailVerified).toBe(false);
  });
});
