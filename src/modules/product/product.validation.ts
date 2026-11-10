import * as z from "zod";
import { ProductStatus } from "../../generated/prisma/enums";

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

const optionalText = (label: string, max: number) =>
    z
        .string({ error: `${label} must be a string` })
        .trim()
        .max(max, { error: `${label} must be at most ${max} characters` })
        .transform((value) => value || null)
        .exactOptional();

const money = (label: string) =>
    z
        .string({ error: `${label} is required` })
        .trim()
        .regex(/^\d{1,10}(\.\d{1,2})?$/, { error: `${label} must be a number with up to 2 decimal places` });

const wholeNumber = (label: string) =>
    z.coerce
        .number({ error: `${label} must be a number` })
        .int({ error: `${label} must be a whole number` })
        .min(0, { error: `${label} cannot be negative` });

const idList = z.preprocess(
    (value) => {
        const items = Array.isArray(value) ? value : String(value ?? "").split(",");
        return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
    },
    z.array(z.string()).max(20, { error: "A product can have at most 20 tags" }),
);

export const createProductSchema = z
    .strictObject(
        {
            name: z
                .string({ error: "Name is required" })
                .trim()
                .min(2, { error: "Name must be at least 2 characters" })
                .max(200, { error: "Name must be at most 200 characters" }),
            sku: z
                .string({ error: "SKU must be a string" })
                .trim()
                .max(50, { error: "SKU must be at most 50 characters" })
                .regex(/^[A-Za-z0-9-_]*$/, { error: "SKU can only contain letters, numbers, - and _" })
                .transform((value) => value.toUpperCase() || undefined)
                .exactOptional(),
            shortDescription: optionalText("Short description", 500),
            description: optionalText("Description", 20000),
            price: money("Price"),
            discountPrice: z
                .string({ error: "Discount price must be a string" })
                .trim()
                .transform((value) => value || null)
                .pipe(money("Discount price").nullable())
                .exactOptional(),
            stock: wholeNumber("Stock").exactOptional(),
            lowStockThreshold: wholeNumber("Low stock threshold").exactOptional(),
            status: z
                .enum([ProductStatus.DRAFT, ProductStatus.ACTIVE, ProductStatus.ARCHIVED], {
                    error: "Status must be DRAFT, ACTIVE or ARCHIVED",
                })
                .exactOptional(),
            isFeatured: z.stringbool({ error: "isFeatured must be true or false" }).exactOptional(),
            categoryId: z.string({ error: "Category is required" }).trim().min(1, { error: "Category is required" }),
            brandId: z
                .string({ error: "Brand id must be a string" })
                .trim()
                .transform((value) => value || null)
                .exactOptional(),
            tagIds: idList.exactOptional(),
            metaTitle: optionalText("Meta title", 150),
            metaDescription: optionalText("Meta description", 300),
        },
        unrecognizedKeysError,
    )
    .refine((data) => !data.discountPrice || Number(data.discountPrice) < Number(data.price), {
        path: ["discountPrice"],
        error: "Discount price must be lower than the price",
    })
    .refine((data) => Number(data.price) > 0, { path: ["price"], error: "Price must be greater than 0" });

export type CreateProductPayload = z.infer<typeof createProductSchema>;
