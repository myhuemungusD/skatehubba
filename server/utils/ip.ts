import type { Request } from "express";
import crypto from "node:crypto";

export const getClientIp = (req: Request): string | null => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0]?.trim() || null;
  }
  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }
  if (Array.isArray(realIp) && realIp.length > 0) {
    return realIp[0]?.trim() || null;
  }
  return req.ip || null;
};

export const hashIp = (ip: string, salt: string) =>
  crypto.createHash("sha256").update(`${ip}:${salt}`).digest("hex");
