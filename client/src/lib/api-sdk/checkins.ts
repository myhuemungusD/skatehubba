import { type CheckInResult } from "../../../../shared/checkin-types";
import { apiRequest } from "../api/client";

type CheckInResponse = {
  status: "ok" | "error";
  checkins?: CheckInResult[];
  message?: string;
};

export async function getUserCheckins(uid: string): Promise<CheckInResult[]> {
  const data = await apiRequest<CheckInResponse>({
    method: "GET",
    path: `/api/checkins?uid=${uid}`,
  });

  if (data.status === "ok" && data.checkins) return data.checkins;
  throw new Error(data.message || "Failed to fetch check-ins");
}
