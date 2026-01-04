import type { CheckInInput, CheckInOutput, CheckInRecord } from "../types/checkin";

export async function checkInToSpot(
  input: CheckInInput,
  authToken?: string
): Promise<CheckInOutput> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch("/api/checkins", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    return {
      status: "fail",
      awardedPoints: 0,
      message: error.message || "Check-in failed",
    };
  }

  const data = await response.json();
  return {
    ...data,
    createdAt: data.createdAt,
  };
}

export async function getUserCheckins(uid: string): Promise<CheckInRecord[]> {
  const response = await fetch(`/api/checkins?uid=${uid}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Failed to fetch check-ins" }));
    throw new Error(error.message || "Failed to fetch check-ins");
  }
  const data = await response.json();
  if (data.status === "ok") {
    return data.checkins;
  }
  throw new Error(data.message || "Failed to fetch check-ins");
}
