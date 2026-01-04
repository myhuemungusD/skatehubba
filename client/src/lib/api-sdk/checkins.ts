import { type CheckInResult } from "../../../../shared/checkin-types";

export async function getUserCheckins(uid: string): Promise<CheckInResult[]> {
  const res = await fetch(`/api/checkins?uid=${uid}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to fetch check-ins");
  }
  const data = await res.json();
  if (data.status === "ok") return data.checkins;
  throw new Error(data.message || "Failed to fetch check-ins");
}
