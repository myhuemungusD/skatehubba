import { z } from "zod";

export const FilmerRequestInput = z
  .object({
    checkInId: z.string().min(1).max(64),
    filmerUid: z.string().min(1).max(128),
  })
  .strict();

export const FilmerRespondInput = z
  .object({
    requestId: z.string().min(1).max(64),
    action: z.enum(["accept", "reject"]),
    reason: z.string().trim().min(1).max(140).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.action === "reject" && !data.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reason is required when rejecting a filmer request.",
        path: ["reason"],
      });
    }
  });

export const FilmerRequestsQuery = z
  .object({
    status: z.enum(["pending", "accepted", "rejected"]).optional(),
    role: z.enum(["filmer", "requester", "all"]).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

export type FilmerRequestInput = z.infer<typeof FilmerRequestInput>;
export type FilmerRespondInput = z.infer<typeof FilmerRespondInput>;
export type FilmerRequestsQuery = z.infer<typeof FilmerRequestsQuery>;
