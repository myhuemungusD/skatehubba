import crypto from "node:crypto";

/**
 * Minimal request-like interface for IP extraction.
 * Compatible with both Express Request objects and lightweight mocks in tests.
 */
interface IpRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

/**
 * Extract the client IP address from a request.
 *
 * Priority: x-forwarded-for → x-real-ip → req.ip → socket.remoteAddress → "unknown".
 * When Express `trust proxy` is set (see app.ts), req.ip already parses
 * x-forwarded-for correctly. The header fallbacks are retained as a safety net.
 */
export const getClientIp = (req: IpRequest): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.split(",")[0]?.trim() || "unknown";
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }
  if (Array.isArray(realIp) && realIp.length > 0) {
    return realIp[0]?.trim() || "unknown";
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
};

export const hashIp = (ip: string, salt: string) =>
  crypto.createHash("sha256").update(`${ip}:${salt}`).digest("hex");
