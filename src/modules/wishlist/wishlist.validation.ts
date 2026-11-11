import * as z from "zod";
import { paginationQuerySchema } from "../../shared/pagination";

const productIdField = z.string({ error: "Product id is required" }).trim().min(1, { error: "Product id is required" });

export const addToWishlistSchema = z.strictObject({
    productId: productIdField,
});

export const mergeWishlistSchema = z.strictObject({
    productIds: z
        .array(productIdField, { error: "Product ids must be a list" })
        .min(1, { error: "Send at least one product id" })
        .max(100, { error: "You can merge at most 100 products at once" })
        .transform((ids) => [...new Set(ids)]),
});

export const wishlistProductIdParamSchema = z.object({
    productId: productIdField,
});

export const getWishlistQuerySchema = paginationQuerySchema;

export type AddToWishlistPayload = z.infer<typeof addToWishlistSchema>;
export type MergeWishlistPayload = z.infer<typeof mergeWishlistSchema>;
export type GetWishlistQuery = z.infer<typeof getWishlistQuerySchema>;
