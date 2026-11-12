import * as z from "zod";
import { paginationQuerySchema } from "../../shared/pagination";
import { booleanQuery, searchTermQuery } from "../../shared/filters";
import { CouponScope, DiscountType } from "../../generated/prisma/enums";

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

export const couponIdParamSchema = z.object({
    couponId: z.string({ error: "Coupon id is required" }).trim().min(1, { error: "Coupon id is required" }),
});

const codeField = z
    .string({ error: "Coupon code is required" })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,30}$/, {
        error: "Coupon code must be 3-30 characters using letters, numbers, - or _",
    });

const moneyField = (label: string) =>
    z
        .union([z.string(), z.number()], { error: `${label} is required` })
        .transform((value) => String(value).trim())
        .pipe(
            z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, {
                error: `${label} must be a number of 0 or more with up to 2 decimal places`,
            }),
        );

const optionalLimitField = (label: string) =>
    z
        .number({ error: `${label} must be a number` })
        .int({ error: `${label} must be a whole number` })
        .min(1, { error: `${label} must be at least 1` })
        .nullable()
        .exactOptional();

const dateField = (label: string) =>
    z
        .iso.datetime({ offset: true, error: `${label} must be a valid date-time` })
        .transform((value) => new Date(value))
        .nullable()
        .exactOptional();

const idListField = (label: string) =>
    z
        .array(z.string().trim().min(1, { error: `${label} id cannot be empty` }), { error: `${label} ids must be a list` })
        .max(200, { error: `At most 200 ${label.toLowerCase()} ids are allowed` })
        .transform((ids) => [...new Set(ids)])
        .exactOptional();

const couponFields = {
    code: codeField,
    discountType: z.enum(DiscountType, { error: "Discount type must be PERCENTAGE, FIXED or FREE_DELIVERY" }),
    scope: z.enum(CouponScope, { error: "Scope must be ALL, PRODUCTS or CATEGORIES" }).exactOptional(),
    discountValue: moneyField("Discount value").exactOptional(),
    maxDiscountAmount: moneyField("Max discount amount").nullable().exactOptional(),
    minOrderAmount: moneyField("Min order amount").nullable().exactOptional(),
    usageLimit: optionalLimitField("Usage limit"),
    usageLimitPerUser: optionalLimitField("Usage limit per user"),
    startsAt: dateField("Start date"),
    expiresAt: dateField("Expiry date"),
    isActive: z.boolean({ error: "isActive must be true or false" }).exactOptional(),
    excludeSaleItems: z.boolean({ error: "excludeSaleItems must be true or false" }).exactOptional(),
    productIds: idListField("Product"),
    categoryIds: idListField("Category"),
};

export const createCouponSchema = z.strictObject(couponFields, unrecognizedKeysError);

export const updateCouponSchema = z
    .strictObject(
        {
            ...couponFields,
            code: codeField.exactOptional(),
            discountType: couponFields.discountType.exactOptional(),
        },
        unrecognizedKeysError,
    )
    .refine((data) => Object.keys(data).length > 0, { error: "Provide at least one field to update" });

export const getAllCouponsQuerySchema = paginationQuerySchema.extend({
    isActive: booleanQuery("isActive"),
    discountType: z.enum(DiscountType, { error: "Invalid discount type" }).optional(),
    scope: z.enum(CouponScope, { error: "Invalid scope" }).optional(),
    searchTerm: searchTermQuery,
});

export const applyCouponSchema = z.strictObject(
    {
        code: codeField,
        phone: z
            .string({ error: "Phone must be a string" })
            .trim()
            .regex(/^01[3-9]\d{8}$/, { error: "Phone number must be in the format 01XXXXXXXXX" })
            .exactOptional(),
        deliveryCharge: moneyField("Delivery charge").exactOptional(),
        items: z
            .array(
                z.strictObject(
                    {
                        productId: z.string({ error: "Product id is required" }).trim().min(1, { error: "Product id is required" }),
                        quantity: z
                            .number({ error: "Quantity must be a number" })
                            .int({ error: "Quantity must be a whole number" })
                            .min(1, { error: "Quantity must be at least 1" })
                            .max(1000, { error: "Quantity must be at most 1000" }),
                    },
                    unrecognizedKeysError,
                ),
                { error: "Items are required" },
            )
            .min(1, { error: "Add at least one item" })
            .max(100, { error: "At most 100 items are allowed" }),
    },
    unrecognizedKeysError,
);

export type CreateCouponPayload = z.infer<typeof createCouponSchema>;
export type UpdateCouponPayload = z.infer<typeof updateCouponSchema>;
export type GetAllCouponsQuery = z.infer<typeof getAllCouponsQuerySchema>;
export type ApplyCouponPayload = z.infer<typeof applyCouponSchema>;
