import crypto from "node:crypto";

/**
 * Minimal request-like interface for IP extraction.
 * Compatible with both Express Request objects and lightweight mocks in tests.
 */
interface IpRequest {
  ip?: string;
  socket?: { remoteAddress?: string };
}

/**
 * Extract the client IP address from a request.
 *
 * Express `trust proxy` is set in app.ts, so `req.ip` already resolves
 * x-forwarded-for correctly. We fall back to `socket.remoteAddress` only
 * for non-Express contexts (e.g. raw HTTP upgrade handlers).
 */
export const getClientIp = (req: IpRequest): string => {
  return req.ip || req.socket?.remoteAddress || "unknown";
};

export const hashIp = (ip: string, salt: string) =>
  crypto.createHash("sha256").update(`${ip}:${salt}`).digest("hex");
