import type { CustomUser } from "../../packages/shared/schema";

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
