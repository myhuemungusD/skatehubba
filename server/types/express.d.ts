import type { CustomUser } from '../../shared/schema';

declare global {
  namespace Express {
    interface Request {
      currentUser?: CustomUser;
    }
  }
}

export {};
