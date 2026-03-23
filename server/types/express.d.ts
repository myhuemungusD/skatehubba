import type { CustomUser } from "@shared/schema";

export type AuthenticatedUser = CustomUser & {
  roles: string[];
};

declare global {
  namespace Express {
    interface Request {
      currentUser?: AuthenticatedUser;
    }
  }
}

export {};
