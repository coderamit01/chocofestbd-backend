import * as z from "zod";
import { paginationQuerySchema } from "../../shared/pagination";

export const tagIdParamSchema = z.object({
    tagId: z.string({ error: "Tag id is required" }).trim().min(1, { error: "Tag id is required" }),
});

export const tagSchema = z.strictObject(
    {
        name: z
            .string({ error: "Name is required" })
            .trim()
            .min(2, { error: "Name must be at least 2 characters" })
            .max(50, { error: "Name must be at most 50 characters" }),
    },
    { error: (issue) => (issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined) },
);

export const getAllTagsQuerySchema = paginationQuerySchema.extend({
    searchTerm: z.string().trim().min(1).optional(),
});

export type TagPayload = z.infer<typeof tagSchema>;
export type GetAllTagsQuery = z.infer<typeof getAllTagsQuerySchema>;
