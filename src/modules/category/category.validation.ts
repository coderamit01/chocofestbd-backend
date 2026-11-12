import * as z from "zod";
import { paginationQuerySchema } from "../../shared/pagination";

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

export const categoryIdParamSchema = z.object({
    categoryId: z.string({ error: "Category id is required" }).trim().min(1, { error: "Category id is required" }),
});

const categoryFields = {
    name: z
        .string({ error: "Name is required" })
        .trim()
        .min(2, { error: "Name must be at least 2 characters" })
        .max(100, { error: "Name must be at most 100 characters" }),
    description: optionalText("Description", 2000),
    parentId: z
        .string({ error: "Parent id must be a string" })
        .trim()
        .transform((value) => value || null)
        .exactOptional(),
    sortOrder: z.coerce
        .number({ error: "Sort order must be a number" })
        .int({ error: "Sort order must be a whole number" })
        .min(0, { error: "Sort order cannot be negative" })
        .exactOptional(),
    isActive: z.stringbool({ error: "isActive must be true or false" }).exactOptional(),
    metaTitle: optionalText("Meta title", 150),
    metaDescription: optionalText("Meta description", 300),
};

export const createCategorySchema = z.strictObject(categoryFields, unrecognizedKeysError);

export const updateCategorySchema = z.strictObject(
    {
        ...categoryFields,
        name: categoryFields.name.exactOptional(),
        removeImage: z.stringbool({ error: "removeImage must be true or false" }).exactOptional(),
        removeMetaImage: z.stringbool({ error: "removeMetaImage must be true or false" }).exactOptional(),
    },
    unrecognizedKeysError,
);

export const getAllCategoriesQuerySchema = paginationQuerySchema.extend({
    parentId: z.string().trim().min(1).optional(),
    isActive: z
        .enum(["true", "false"], { error: "isActive must be true or false" })
        .transform((value) => value === "true")
        .optional(),
    searchTerm: z.string().trim().min(1).optional(),
});

export const categorySlugParamSchema = z.object({
    slug: z.string({ error: "Category slug is required" }).trim().min(1, { error: "Category slug is required" }),
});

export type CreateCategoryPayload = z.infer<typeof createCategorySchema>;
export type UpdateCategoryPayload = z.infer<typeof updateCategorySchema>;
export type GetAllCategoriesQuery = z.infer<typeof getAllCategoriesQuerySchema>;
