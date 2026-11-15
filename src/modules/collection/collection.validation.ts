import * as z from "zod";
import { paginationQuerySchema } from "../../shared/pagination";
import { booleanQuery, searchTermQuery } from "../../shared/filters";

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

const dateField = (label: string) =>
    z.iso
        .datetime({ offset: true, error: `${label} must be a date-time like 2026-11-20T00:00:00+06:00` })
        .transform((value) => new Date(value))
        .nullable();

const collectionFields = {
    title: z
        .string({ error: "Title is required" })
        .trim()
        .min(2, { error: "Title must be at least 2 characters" })
        .max(100, { error: "Title must be at most 100 characters" }),
    description: z
        .string({ error: "Description must be a string" })
        .trim()
        .max(500, { error: "Description must be at most 500 characters" })
        .transform((value) => value || null)
        .nullable(),
    position: z
        .number({ error: "Position must be a number" })
        .int({ error: "Position must be a whole number" })
        .min(0, { error: "Position cannot be negative" }),
    isActive: z.boolean({ error: "isActive must be true or false" }),
    showOnHome: z.boolean({ error: "showOnHome must be true or false" }),
    startsAt: dateField("startsAt"),
    endsAt: dateField("endsAt"),
};

const validDateRange = (data: { startsAt?: Date | null; endsAt?: Date | null }) =>
    !(data.startsAt && data.endsAt && data.endsAt <= data.startsAt);

const dateRangeError = { path: ["endsAt"], error: "endsAt must be after startsAt" };

export const collectionIdParamSchema = z.object({
    collectionId: z.string({ error: "Collection id is required" }).trim().min(1, { error: "Collection id is required" }),
});

export const collectionSlugParamSchema = z.object({
    slug: z.string({ error: "Slug is required" }).trim().toLowerCase().min(1, { error: "Slug is required" }),
});

export const createCollectionSchema = z
    .strictObject(
        {
            title: collectionFields.title,
            description: collectionFields.description.exactOptional(),
            position: collectionFields.position.exactOptional(),
            isActive: collectionFields.isActive.exactOptional(),
            showOnHome: collectionFields.showOnHome.exactOptional(),
            startsAt: collectionFields.startsAt.exactOptional(),
            endsAt: collectionFields.endsAt.exactOptional(),
        },
        unrecognizedKeysError,
    )
    .refine(validDateRange, dateRangeError);

export const updateCollectionSchema = z
    .strictObject(
        {
            title: collectionFields.title.exactOptional(),
            description: collectionFields.description.exactOptional(),
            position: collectionFields.position.exactOptional(),
            isActive: collectionFields.isActive.exactOptional(),
            showOnHome: collectionFields.showOnHome.exactOptional(),
            startsAt: collectionFields.startsAt.exactOptional(),
            endsAt: collectionFields.endsAt.exactOptional(),
        },
        unrecognizedKeysError,
    )
    .refine((data) => Object.keys(data).length > 0, { error: "Provide at least one field to update" })
    .refine(validDateRange, dateRangeError);

export const setCollectionProductsSchema = z.strictObject(
    {
        productIds: z
            .array(
                z.string({ error: "Product id must be a string" }).trim().min(1, { error: "Product id is required" }),
                { error: "productIds must be a list" },
            )
            .max(100, { error: "At most 100 products are allowed" })
            .refine((ids) => new Set(ids).size === ids.length, { error: "Product ids must be unique" }),
    },
    unrecognizedKeysError,
);

export const getAllCollectionsQuerySchema = paginationQuerySchema.extend({
    isActive: booleanQuery("isActive"),
    showOnHome: booleanQuery("showOnHome"),
    searchTerm: searchTermQuery,
});

export const getHomeCollectionsQuerySchema = z.object({
    productLimit: z.coerce
        .number({ error: "productLimit must be a number" })
        .int({ error: "productLimit must be a whole number" })
        .min(1, { error: "productLimit must be at least 1" })
        .max(30, { error: "productLimit must be at most 30" })
        .default(12),
});

export const getCollectionProductsQuerySchema = paginationQuerySchema;

export type CreateCollectionPayload = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionPayload = z.infer<typeof updateCollectionSchema>;
export type SetCollectionProductsPayload = z.infer<typeof setCollectionProductsSchema>;
export type GetAllCollectionsQuery = z.infer<typeof getAllCollectionsQuerySchema>;
export type GetHomeCollectionsQuery = z.infer<typeof getHomeCollectionsQuerySchema>;
export type GetCollectionProductsQuery = z.infer<typeof getCollectionProductsQuerySchema>;
