import * as z from "zod";
import { paginationQuerySchema } from "../../shared/pagination";
import { booleanQuery, searchTermQuery } from "../../shared/filters";

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

export const deliveryZoneIdParamSchema = z.object({
    zoneId: z.string({ error: "Delivery zone id is required" }).trim().min(1, { error: "Delivery zone id is required" }),
});

const zoneFields = {
    name: z
        .string({ error: "Name is required" })
        .trim()
        .min(2, { error: "Name must be at least 2 characters" })
        .max(100, { error: "Name must be at most 100 characters" }),
    charge: z
        .union([z.string(), z.number()], { error: "Charge is required" })
        .transform((value) => String(value).trim())
        .pipe(
            z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, {
                error: "Charge must be a number of 0 or more with up to 2 decimal places",
            }),
        ),
    estimatedDays: z
        .string({ error: "Estimated days must be a string" })
        .trim()
        .max(50, { error: "Estimated days must be at most 50 characters" })
        .transform((value) => value || null)
        .nullable()
        .exactOptional(),
    sortOrder: z
        .number({ error: "Sort order must be a number" })
        .int({ error: "Sort order must be a whole number" })
        .min(0, { error: "Sort order cannot be negative" })
        .exactOptional(),
    isActive: z.boolean({ error: "isActive must be true or false" }).exactOptional(),
};

export const createDeliveryZoneSchema = z.strictObject(zoneFields, unrecognizedKeysError);

export const updateDeliveryZoneSchema = z
    .strictObject(
        {
            ...zoneFields,
            name: zoneFields.name.exactOptional(),
            charge: zoneFields.charge.exactOptional(),
        },
        unrecognizedKeysError,
    )
    .refine((data) => Object.keys(data).length > 0, { error: "Provide at least one field to update" });

export const getAllDeliveryZonesQuerySchema = paginationQuerySchema.extend({
    isActive: booleanQuery("isActive"),
    searchTerm: searchTermQuery,
});

export type CreateDeliveryZonePayload = z.infer<typeof createDeliveryZoneSchema>;
export type UpdateDeliveryZonePayload = z.infer<typeof updateDeliveryZoneSchema>;
export type GetAllDeliveryZonesQuery = z.infer<typeof getAllDeliveryZonesQuerySchema>;
