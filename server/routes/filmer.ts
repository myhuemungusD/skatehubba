import type { Request, Response } from "express";
import {
  FilmerRequestInput,
  FilmerRespondInput,
  FilmerRequestsQuery,
} from "@shared/validation/filmer";
import {
  createFilmerRequest,
  FilmerRequestError,
  listFilmerRequests,
  respondToFilmerRequest,
} from "../services/filmerRequests";
import { getClientIP } from "../auth/audit";

const getDeviceId = (req: Request) => {
  const deviceId = req.get("x-device-id") || req.get("x-device");
  return deviceId || undefined;
};

const parseCheckInId = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new FilmerRequestError("INVALID_CHECKIN", "Invalid check-in ID", 400);
  }
  return parsed;
};

const handleError = (res: Response, error: unknown) => {
  if (error instanceof FilmerRequestError) {
    return res.status(error.status).json({ error: error.code, message: error.message });
  }
  return res.status(500).json({ error: "SERVER_ERROR" });
};

export const handleFilmerRequest = async (req: Request, res: Response) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  const parsed = FilmerRequestInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }

  try {
    const checkInId = parseCheckInId(parsed.data.checkInId);
    const ipAddress = getClientIP(req);

    const result = await createFilmerRequest({
      requesterId: req.currentUser.id,
      requesterTrustLevel: req.currentUser.trustLevel ?? 0,
      requesterIsActive: req.currentUser.isActive ?? true,
      checkInId,
      filmerUid: parsed.data.filmerUid,
      ipAddress,
      userAgent: req.get("user-agent") || undefined,
      deviceId: getDeviceId(req),
    });

    const statusCode = result.alreadyExists ? 200 : 201;
    return res.status(statusCode).json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

export const handleFilmerRespond = async (req: Request, res: Response) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  const parsed = FilmerRespondInput.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }

  try {
    const ipAddress = getClientIP(req);
    const result = await respondToFilmerRequest({
      requestId: parsed.data.requestId,
      filmerId: req.currentUser.id,
      action: parsed.data.action,
      reason: parsed.data.reason,
      ipAddress,
      userAgent: req.get("user-agent") || undefined,
      deviceId: getDeviceId(req),
    });

    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
};

export const handleFilmerRequestsList = async (req: Request, res: Response) => {
  if (!req.currentUser) {
    return res.status(401).json({ error: "AUTH_REQUIRED" });
  }

  const queryInput = {
    status: Array.isArray(req.query.status) ? req.query.status[0] : req.query.status,
    role: Array.isArray(req.query.role) ? req.query.role[0] : req.query.role,
    limit: Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit,
  };

  const parsed = FilmerRequestsQuery.safeParse(queryInput);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }

  try {
    const requests = await listFilmerRequests({
      userId: req.currentUser.id,
      status: parsed.data.status,
      role: parsed.data.role,
      limit: parsed.data.limit,
    });

    return res.status(200).json({ requests });
  } catch (error) {
    return handleError(res, error);
  }
};
