import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

type ValidationOptions = {
  errorCode?: string;
  status?: number;
  includeDetails?: boolean;
};

const DEFAULT_ERROR_CODE = "validation_error";

export const validateBody =
  <T>(schema: z.ZodType<T>, options: ValidationOptions = {}) =>
  (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const status = options.status ?? 400;
      const errorCode = options.errorCode ?? DEFAULT_ERROR_CODE;
      const body: { error: string; details?: Record<string, unknown> } = {
        error: errorCode,
      };
      if (options.includeDetails ?? true) {
        body.details = parsed.error.flatten();
      }
      return res.status(status).json(body);
    }

    (req as Request & { validatedBody: T }).validatedBody = parsed.data;
    return next();
  };
