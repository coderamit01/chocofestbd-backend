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

export const brandIdParamSchema = z.object({
    brandId: z.string({ error: "Brand id is required" }).trim().min(1, { error: "Brand id is required" }),
});

const brandFields = {
    name: z
        .string({ error: "Name is required" })
        .trim()
        .min(2, { error: "Name must be at least 2 characters" })
        .max(100, { error: "Name must be at most 100 characters" }),
    description: optionalText("Description", 2000),
    country: optionalText("Country", 100),
    isActive: z.stringbool({ error: "isActive must be true or false" }).exactOptional(),
    metaTitle: optionalText("Meta title", 150),
    metaDescription: optionalText("Meta description", 300),
};

export const createBrandSchema = z.strictObject(brandFields, unrecognizedKeysError);

export const updateBrandSchema = z.strictObject(
    {
        ...brandFields,
        name: brandFields.name.exactOptional(),
        removeLogo: z.stringbool({ error: "removeLogo must be true or false" }).exactOptional(),
        removeMetaImage: z.stringbool({ error: "removeMetaImage must be true or false" }).exactOptional(),
    },
    unrecognizedKeysError,
);

export const getAllBrandsQuerySchema = paginationQuerySchema.extend({
    isActive: z
        .enum(["true", "false"], { error: "isActive must be true or false" })
        .transform((value) => value === "true")
        .optional(),
    searchTerm: z.string().trim().min(1).optional(),
});

export const brandSlugParamSchema = z.object({
    slug: z.string({ error: "Brand slug is required" }).trim().min(1, { error: "Brand slug is required" }),
});

export type CreateBrandPayload = z.infer<typeof createBrandSchema>;
export type UpdateBrandPayload = z.infer<typeof updateBrandSchema>;
export type GetAllBrandsQuery = z.infer<typeof getAllBrandsQuerySchema>;
