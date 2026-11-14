import * as z from "zod";
import { OrderStatus, PaymentMethod, PaymentStatus } from "../../generated/prisma/enums";
import { paginationQuerySchema } from "../../shared/pagination";
import { searchTermQuery } from "../../shared/filters";
import { findThana } from "../location/location.service";
import { addressFields } from "../address/address.validation";

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

const shippingSchema = z
    .strictObject(
        {
            recipientName: addressFields.recipientName,
            recipientPhone: addressFields.recipientPhone,
            address: addressFields.address,
            district: addressFields.district,
            area: addressFields.area,
            deliveryZoneId: addressFields.deliveryZoneId,
        },
        unrecognizedKeysError,
    )
    .transform((data, ctx) => {
        const area = findThana(data.district, data.area);

        if (!area) {
            ctx.addIssue({ code: "custom", path: ["area"], message: "Select a valid area for this district" });
            return z.NEVER;
        }

        return { ...data, area: area.name };
    });

const checkoutFields = {
    items: z
        .array(
            z.strictObject(
                {
                    productId: z.string({ error: "Product id is required" }).trim().min(1, { error: "Product id is required" }),
                    quantity: z
                        .number({ error: "Quantity must be a number" })
                        .int({ error: "Quantity must be a whole number" })
                        .min(1, { error: "Quantity must be at least 1" })
                        .max(50, { error: "Quantity must be at most 50" }),
                },
                unrecognizedKeysError,
            ),
            { error: "Items must be a list" },
        )
        .min(1, { error: "Add at least one item" })
        .max(50, { error: "At most 50 items are allowed" })
        .exactOptional(),
    addressId: z.string({ error: "Address id must be a string" }).trim().min(1, { error: "Address id is required" }).exactOptional(),
    shipping: shippingSchema.exactOptional(),
    email: z.email({ error: "Enter a valid email address" }).trim().toLowerCase().exactOptional(),
    couponCode: z
        .string({ error: "Coupon code must be a string" })
        .trim()
        .toUpperCase()
        .transform((value) => value || undefined)
        .exactOptional(),
    customerNote: z
        .string({ error: "Note must be a string" })
        .trim()
        .max(500, { error: "Note must be at most 500 characters" })
        .transform((value) => value || undefined)
        .exactOptional(),
    paymentMethod: z
        .literal(PaymentMethod.COD, { error: "Only cash on delivery is available right now" })
        .default(PaymentMethod.COD),
    saveAddress: z.boolean({ error: "saveAddress must be true or false" }).exactOptional(),
};

export const checkoutSchema = z
    .strictObject(checkoutFields, unrecognizedKeysError)
    .refine((data) => !(data.addressId && data.shipping), {
        path: ["addressId"],
        error: "Send either a saved address or a new shipping address, not both",
    })
    .refine((data) => data.addressId || data.shipping, {
        path: ["shipping"],
        error: "Shipping address is required",
    });

export const checkoutPreviewSchema = z
    .strictObject(
        {
            items: checkoutFields.items,
            addressId: checkoutFields.addressId,
            deliveryZoneId: addressFields.deliveryZoneId.exactOptional(),
            couponCode: checkoutFields.couponCode,
            phone: addressFields.recipientPhone.exactOptional(),
        },
        unrecognizedKeysError,
    )
    .refine((data) => !(data.addressId && data.deliveryZoneId), {
        path: ["addressId"],
        error: "Send either a saved address or a delivery zone, not both",
    });

const noteField = (label: string, max: number) =>
    z
        .string({ error: `${label} must be a string` })
        .trim()
        .max(max, { error: `${label} must be at most ${max} characters` })
        .transform((value) => value || undefined);

const dateQuery = (label: string) =>
    z.iso
        .date({ error: `${label} must be a date like 2026-11-14` })
        .optional();

export const orderIdParamSchema = z.object({
    orderId: z.string({ error: "Order id is required" }).trim().min(1, { error: "Order id is required" }),
});

export const orderSortOptions = ["newest", "oldest", "highest", "lowest"] as const;

const sortQuery = z
    .enum(orderSortOptions, { error: "Sort must be newest, oldest, highest or lowest" })
    .default("newest");

export const getMyOrdersQuerySchema = paginationQuerySchema.extend({
    status: z.enum(OrderStatus, { error: "Invalid order status" }).optional(),
});

export const getAllOrdersQuerySchema = paginationQuerySchema
    .extend({
        status: z.enum(OrderStatus, { error: "Invalid order status" }).optional(),
        paymentStatus: z.enum(PaymentStatus, { error: "Invalid payment status" }).optional(),
        searchTerm: searchTermQuery,
        from: dateQuery("from"),
        to: dateQuery("to"),
        sort: sortQuery,
    })
    .refine((data) => !(data.from && data.to && data.from > data.to), {
        path: ["to"],
        error: "to must be on or after from",
    });

export const trackOrderQuerySchema = z.object({
    orderNumber: z
        .string({ error: "Order number is required" })
        .trim()
        .toUpperCase()
        .min(1, { error: "Order number is required" }),
    phone: addressFields.recipientPhone,
});

export const cancelMyOrderSchema = z.strictObject(
    {
        reason: noteField("Reason", 300).exactOptional(),
    },
    unrecognizedKeysError,
);

export const updateOrderStatusSchema = z
    .strictObject(
        {
            status: z.enum(OrderStatus, { error: "Invalid order status" }),
            note: noteField("Note", 300).exactOptional(),
            cancelReason: noteField("Cancel reason", 300).exactOptional(),
            restock: z.boolean({ error: "restock must be true or false" }).default(true),
        },
        unrecognizedKeysError,
    )
    .refine((data) => data.status !== OrderStatus.CANCELLED || data.cancelReason, {
        path: ["cancelReason"],
        error: "Cancel reason is required",
    })
    .refine((data) => data.status === OrderStatus.CANCELLED || !data.cancelReason, {
        path: ["cancelReason"],
        error: "Cancel reason is only for cancelled orders",
    });

export const updateAdminNoteSchema = z.strictObject(
    {
        adminNote: z
            .string({ error: "Admin note must be a string" })
            .trim()
            .max(1000, { error: "Admin note must be at most 1000 characters" })
            .transform((value) => value || null),
    },
    unrecognizedKeysError,
);

export type CheckoutPayload = z.infer<typeof checkoutSchema>;
export type CheckoutPreviewPayload = z.infer<typeof checkoutPreviewSchema>;
export type CheckoutItem = NonNullable<CheckoutPayload["items"]>[number];
export type GetMyOrdersQuery = z.infer<typeof getMyOrdersQuerySchema>;
export type GetAllOrdersQuery = z.infer<typeof getAllOrdersQuerySchema>;
export type TrackOrderQuery = z.infer<typeof trackOrderQuerySchema>;
export type CancelMyOrderPayload = z.infer<typeof cancelMyOrderSchema>;
export type UpdateOrderStatusPayload = z.infer<typeof updateOrderStatusSchema>;
export type UpdateAdminNotePayload = z.infer<typeof updateAdminNoteSchema>;
export type OrderSortOption = (typeof orderSortOptions)[number];
