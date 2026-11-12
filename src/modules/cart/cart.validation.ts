import * as z from "zod";

export const MAX_ITEM_QUANTITY = 50;
export const MAX_CART_ITEMS = 50;

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

const productIdField = z.string({ error: "Product id is required" }).trim().min(1, { error: "Product id is required" });

const quantityField = z
    .number({ error: "Quantity must be a number" })
    .int({ error: "Quantity must be a whole number" })
    .min(1, { error: "Quantity must be at least 1" })
    .max(MAX_ITEM_QUANTITY, { error: `Quantity must be at most ${MAX_ITEM_QUANTITY}` });

export const cartProductIdParamSchema = z.object({
    productId: productIdField,
});

export const addToCartSchema = z.strictObject(
    {
        productId: productIdField,
        quantity: quantityField.default(1),
    },
    unrecognizedKeysError,
);

export const updateCartItemSchema = z.strictObject(
    {
        quantity: quantityField,
    },
    unrecognizedKeysError,
);

export const mergeCartSchema = z.strictObject(
    {
        items: z
            .array(z.strictObject({ productId: productIdField, quantity: quantityField }, unrecognizedKeysError), {
                error: "Items must be a list",
            })
            .min(1, { error: "Send at least one item" })
            .max(MAX_CART_ITEMS, { error: `You can merge at most ${MAX_CART_ITEMS} items at once` }),
    },
    unrecognizedKeysError,
);

export type AddToCartPayload = z.infer<typeof addToCartSchema>;
export type UpdateCartItemPayload = z.infer<typeof updateCartItemSchema>;
export type MergeCartPayload = z.infer<typeof mergeCartSchema>;
