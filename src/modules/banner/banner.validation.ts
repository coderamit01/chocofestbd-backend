import * as z from "zod";
import { paginationQuerySchema } from "../../shared/pagination";

export const bannerCategoryIdParamSchema = z.object({
    categoryId: z.string({ error: "Category id is required" }).trim().min(1, { error: "Category id is required" }),
});

export const bannerCategorySchema = z.strictObject({
    name: z
        .string({ error: "Name is required" })
        .trim()
        .min(2, { error: "Name must be at least 2 characters" })
        .max(50, { error: "Name must be at most 50 characters" }),
});

export const bannerIdParamSchema = z.object({
    bannerId: z.string({ error: "Banner id is required" }).trim().min(1, { error: "Banner id is required" }),
});

const bannerFields = {
    title: z
        .string({ error: "Title is required" })
        .trim()
        .min(2, { error: "Title must be at least 2 characters" })
        .max(150, { error: "Title must be at most 150 characters" }),
    link: z
        .string({ error: "Link must be a string" })
        .trim()
        .max(500, { error: "Link must be at most 500 characters" })
        .nullable(),
    categoryId: z.string({ error: "Category id is required" }).trim().min(1, { error: "Category id is required" }),
    sortOrder: z
        .number({ error: "Sort order must be a number" })
        .int({ error: "Sort order must be a whole number" })
        .min(0, { error: "Sort order cannot be negative" }),
    isActive: z.boolean({ error: "isActive must be true or false" }),
};

export const createBannerSchema = z.strictObject(
    {
        title: bannerFields.title,
        link: z
            .string({ error: "Link must be a string" })
            .trim()
            .max(500, { error: "Link must be at most 500 characters" })
            .transform((value) => value || null)
            .exactOptional(),
        categoryId: bannerFields.categoryId,
        sortOrder: z.coerce
            .number({ error: "Sort order must be a number" })
            .int({ error: "Sort order must be a whole number" })
            .min(0, { error: "Sort order cannot be negative" })
            .exactOptional(),
        isActive: z.stringbool({ error: "isActive must be true or false" }).exactOptional(),
    },
    { error: (issue) => (issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined) },
);

export const updateBannerSchema = z.strictObject(
    {
        title: createBannerSchema.shape.title.exactOptional(),
        link: createBannerSchema.shape.link,
        categoryId: createBannerSchema.shape.categoryId.exactOptional(),
        sortOrder: createBannerSchema.shape.sortOrder,
        isActive: createBannerSchema.shape.isActive,
    },
    { error: (issue) => (issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined) },
);

export const getAllBannersQuerySchema = paginationQuerySchema.extend({
    categoryId: z.string().trim().min(1).optional(),
    isActive: z
        .enum(["true", "false"], { error: "isActive must be true or false" })
        .transform((value) => value === "true")
        .optional(),
    searchTerm: z.string().trim().min(1).optional(),
});

export const getPublicBannersQuerySchema = z.object({
    category: z.string().trim().min(1, { error: "Category cannot be empty" }).max(50).optional(),
});

export type BannerCategoryPayload = z.infer<typeof bannerCategorySchema>;
export type CreateBannerPayload = z.infer<typeof createBannerSchema>;
export type UpdateBannerPayload = z.infer<typeof updateBannerSchema>;
export type GetPublicBannersQuery = z.infer<typeof getPublicBannersQuerySchema>;
export type GetAllBannersQuery = z.infer<typeof getAllBannersQuerySchema>;
