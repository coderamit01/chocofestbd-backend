import * as z from "zod";
import { findDistrict, findThana } from "../location/location.service";

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

export const addressIdParamSchema = z.object({
    addressId: z.string({ error: "Address id is required" }).trim().min(1, { error: "Address id is required" }),
});

const addressFields = {
    label: z
        .string({ error: "Label must be a string" })
        .trim()
        .max(30, { error: "Label must be at most 30 characters" })
        .transform((value) => value || null)
        .nullable()
        .exactOptional(),
    recipientName: z
        .string({ error: "Recipient name is required" })
        .trim()
        .min(2, { error: "Recipient name must be at least 2 characters" })
        .max(100, { error: "Recipient name must be at most 100 characters" }),
    recipientPhone: z
        .string({ error: "Recipient phone is required" })
        .trim()
        .regex(/^01[3-9]\d{8}$/, { error: "Phone number must be in the format 01XXXXXXXXX" }),
    address: z
        .string({ error: "Address is required" })
        .trim()
        .min(5, { error: "Address must be at least 5 characters" })
        .max(300, { error: "Address must be at most 300 characters" }),
    district: z
        .string({ error: "District is required" })
        .trim()
        .min(1, { error: "District is required" })
        .transform((value, ctx) => {
            const district = findDistrict(value);

            if (!district) {
                ctx.addIssue({ code: "custom", message: "Select a valid district" });
                return z.NEVER;
            }

            return district.name;
        }),
    area: z
        .string({ error: "Area is required" })
        .trim()
        .min(1, { error: "Area is required" }),
    deliveryZoneId: z
        .string({ error: "Delivery zone is required" })
        .trim()
        .min(1, { error: "Delivery zone is required" }),
    isDefault: z.boolean({ error: "isDefault must be true or false" }).exactOptional(),
};

export const createAddressSchema = z
    .strictObject(addressFields, unrecognizedKeysError)
    .transform((data, ctx) => {
        const area = findThana(data.district, data.area);

        if (!area) {
            ctx.addIssue({ code: "custom", path: ["area"], message: "Select a valid area for this district" });
            return z.NEVER;
        }

        return { ...data, area: area.name };
    });

export const updateAddressSchema = z
    .strictObject(
        {
            label: addressFields.label,
            recipientName: addressFields.recipientName.exactOptional(),
            recipientPhone: addressFields.recipientPhone.exactOptional(),
            address: addressFields.address.exactOptional(),
            district: addressFields.district.exactOptional(),
            area: addressFields.area.exactOptional(),
            deliveryZoneId: addressFields.deliveryZoneId.exactOptional(),
        },
        unrecognizedKeysError,
    )
    .refine((data) => Object.keys(data).length > 0, { error: "Provide at least one field to update" })
    .refine((data) => data.district === undefined || data.area !== undefined, {
        path: ["area"],
        error: "Select an area for the new district",
    });

export type CreateAddressPayload = z.infer<typeof createAddressSchema>;
export type UpdateAddressPayload = z.infer<typeof updateAddressSchema>;
