import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const CSRF_COOKIE_NAME = 'csrfToken';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const createCsrfToken = () => crypto.randomBytes(32).toString('hex');

/**
 * CSRF protection for JSON APIs using a double-submit token strategy.
 * CodeQL: Missing CSRF middleware.
 */
export const ensureCsrfToken = (req: Request, res: Response, next: NextFunction) => {
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    const token = createCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    req.cookies[CSRF_COOKIE_NAME] = token;
  }

  next();
};

export const requireCsrfToken = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.header('x-csrf-token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  return next();
};
