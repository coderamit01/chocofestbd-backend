import * as z from "zod";
import { ProductStatus, StockStatus } from "../../generated/prisma/enums";
import { paginationQuerySchema } from "../../shared/pagination";
import { booleanQuery, numberQuery, searchTermQuery, slugQuery } from "../../shared/filters";

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

const idList = (max: number, tooManyMessage: string) =>
    z.preprocess(
        (value) => {
            const items = Array.isArray(value) ? value : String(value ?? "").split(",");
            return [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
        },
        z.array(z.string()).max(max, { error: tooManyMessage }),
    );

const productFields = {
    slug: z
        .string({ error: "Slug must be a string" })
        .trim()
        .toLowerCase()
        .max(200, { error: "Slug must be at most 200 characters" })
        .regex(/^[\p{L}\p{M}\p{N}]+(?:-[\p{L}\p{M}\p{N}]+)*$/u, {
            error: "Slug can only contain letters, numbers and single hyphens, like lindt-dark-chocolate-100g",
        })
        .exactOptional(),
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
    costPrice: z
        .string({ error: "Cost price must be a string" })
        .trim()
        .transform((value) => value || null)
        .pipe(money("Cost price").nullable())
        .exactOptional(),
    stock: wholeNumber("Stock").exactOptional(),
    lowStockThreshold: wholeNumber("Low stock threshold").exactOptional(),
    manageStock: z.stringbool({ error: "manageStock must be true or false" }).exactOptional(),
    stockStatus: z.enum(StockStatus, { error: "Stock status must be IN_STOCK or OUT_OF_STOCK" }).exactOptional(),
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
    tagIds: idList(20, "A product can have at most 20 tags").exactOptional(),
    metaTitle: optionalText("Meta title", 150),
    metaDescription: optionalText("Meta description", 300),
};

export const productIdParamSchema = z.object({
    productId: z.string({ error: "Product id is required" }).trim().min(1, { error: "Product id is required" }),
});

export const productSlugParamSchema = z.object({
    slug: z.string({ error: "Slug is required" }).trim().min(1, { error: "Slug is required" }),
});

export const createProductSchema = z
    .strictObject(productFields, unrecognizedKeysError)
    .refine((data) => !data.discountPrice || Number(data.discountPrice) < Number(data.price), {
        path: ["discountPrice"],
        error: "Discount price must be lower than the price",
    })
    .refine((data) => Number(data.price) > 0, { path: ["price"], error: "Price must be greater than 0" });

export const updateProductSchema = z
    .strictObject(
        {
            ...productFields,
            name: productFields.name.exactOptional(),
            price: productFields.price.exactOptional(),
            categoryId: productFields.categoryId.exactOptional(),
            removeGalleryImageIds: idList(8, "You can remove at most 8 gallery images at once").exactOptional(),
            galleryOrder: idList(8, "A product can have at most 8 gallery images").exactOptional(),
            galleryAlts: z
                .string({ error: "galleryAlts must be a JSON object" })
                .transform((value, ctx) => {
                    try {
                        return JSON.parse(value) as unknown;
                    } catch {
                        ctx.addIssue({ code: "custom", message: "galleryAlts must be a JSON object" });
                        return z.NEVER;
                    }
                })
                .pipe(
                    z.record(
                        z.string(),
                        z.string({ error: "Alt text must be a string" }).trim().max(150, { error: "Alt text must be at most 150 characters" }),
                    ),
                )
                .exactOptional(),
        },
        unrecognizedKeysError,
    )
    .refine((data) => data.price === undefined || Number(data.price) > 0, {
        path: ["price"],
        error: "Price must be greater than 0",
    });

export const productSortOptions = ["newest", "price_low", "price_high", "popular", "rating"] as const;

const productListFields = {
    searchTerm: searchTermQuery,
    category: slugQuery("Category"),
    brand: slugQuery("Brand"),
    tag: slugQuery("Tag"),
    minPrice: numberQuery("Min price"),
    maxPrice: numberQuery("Max price"),
    minRating: z.coerce
        .number({ error: "Min rating must be a number" })
        .min(1, { error: "Min rating must be between 1 and 5" })
        .max(5, { error: "Min rating must be between 1 and 5" })
        .optional(),
    inStock: booleanQuery("inStock"),
    isFeatured: booleanQuery("isFeatured"),
    sortBy: z
        .enum(productSortOptions, { error: `Sort by must be one of: ${productSortOptions.join(", ")}` })
        .default("newest"),
};

const isPriceRangeValid = (query: { minPrice?: number | undefined; maxPrice?: number | undefined }) =>
    query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice;

const priceRangeError = {
    path: ["minPrice"],
    error: "Min price cannot be greater than max price",
};

export const getAllProductsQuerySchema = paginationQuerySchema
    .extend(productListFields)
    .refine(isPriceRangeValid, priceRangeError);

export const adminProductSortOptions = [...productSortOptions, "stock_low"] as const;

export const adminStockFilters = ["in", "low", "out"] as const;

export const getAdminProductsQuerySchema = paginationQuerySchema
    .extend({
        ...productListFields,
        status: z
            .enum(ProductStatus, { error: "Status must be DRAFT, ACTIVE or ARCHIVED" })
            .optional(),
        stock: z.enum(adminStockFilters, { error: "Stock must be in, low or out" }).optional(),
        sortBy: z
            .enum(adminProductSortOptions, { error: `Sort by must be one of: ${adminProductSortOptions.join(", ")}` })
            .default("newest"),
    })
    .refine(isPriceRangeValid, priceRangeError);

const bulkProductIds = z
    .array(z.string({ error: "Product id must be a string" }).trim().min(1), { error: "Product ids are required" })
    .min(1, { error: "Select at least one product" })
    .max(100, { error: "You can update at most 100 products at once" })
    .transform((ids) => [...new Set(ids)]);

export const bulkUpdateProductsSchema = z
    .strictObject(
        {
            productIds: bulkProductIds,
            status: z
                .enum([ProductStatus.DRAFT, ProductStatus.ACTIVE, ProductStatus.ARCHIVED], {
                    error: "Status must be DRAFT, ACTIVE or ARCHIVED",
                })
                .exactOptional(),
            isFeatured: z.boolean({ error: "isFeatured must be true or false" }).exactOptional(),
            categoryId: z.string({ error: "Category id must be a string" }).trim().min(1).exactOptional(),
        },
        unrecognizedKeysError,
    )
    .refine((data) => data.status !== undefined || data.isFeatured !== undefined || data.categoryId !== undefined, {
        error: "Choose a change to apply",
    });

export const bulkTrashProductsSchema = z.strictObject({ productIds: bulkProductIds }, unrecognizedKeysError);


export const getTrashedProductsQuerySchema = paginationQuerySchema.extend({
    searchTerm: searchTermQuery,
});

export type CreateProductPayload = z.infer<typeof createProductSchema>;
export type GetTrashedProductsQuery = z.infer<typeof getTrashedProductsQuerySchema>;
export type GetAdminProductsQuery = z.infer<typeof getAdminProductsQuerySchema>;
export type UpdateProductPayload = z.infer<typeof updateProductSchema>;
export type GetAllProductsQuery = z.infer<typeof getAllProductsQuerySchema>;
export type ProductSortOption = (typeof productSortOptions)[number];
export type AdminProductSortOption = (typeof adminProductSortOptions)[number];
export type BulkUpdateProductsPayload = z.infer<typeof bulkUpdateProductsSchema>;
