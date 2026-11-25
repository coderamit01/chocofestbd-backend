import * as z from "zod";

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

export const riderOrderIdParamSchema = z.object({
    orderId: z.string({ error: "Order id is required" }).trim().min(1, { error: "Order id is required" }),
});

export const markDeliveredSchema = z.strictObject(
    {
        cashCollected: z.boolean({ error: "cashCollected must be true or false" }).default(false),
    },
    unrecognizedKeysError,
);

export const markFailedSchema = z.strictObject(
    {
        reason: z
            .string({ error: "Reason is required" })
            .trim()
            .min(2, { error: "Reason is required" })
            .max(200, { error: "Reason must be at most 200 characters" }),
    },
    unrecognizedKeysError,
);

export type MarkDeliveredPayload = z.infer<typeof markDeliveredSchema>;
export type MarkFailedPayload = z.infer<typeof markFailedSchema>;
