import * as z from "zod";
import { paginationQuerySchema } from "../../shared/pagination";
import { booleanQuery, searchTermQuery } from "../../shared/filters";
import { ReviewStatus } from "../../generated/prisma/enums";

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

const idField = (label: string) =>
    z.string({ error: `${label} is required` }).trim().min(1, { error: `${label} is required` });

export const reviewIdParamSchema = z.object({ reviewId: idField("Review id") });

export const reviewProductIdParamSchema = z.object({ productId: idField("Product id") });

const reviewFields = {
    rating: z.coerce
        .number({ error: "Rating must be a number" })
        .int({ error: "Rating must be a whole number" })
        .min(1, { error: "Rating must be between 1 and 5" })
        .max(5, { error: "Rating must be between 1 and 5" }),
    comment: z
        .string({ error: "Comment must be a string" })
        .trim()
        .max(2000, { error: "Comment must be at most 2000 characters" })
        .transform((value) => value || null)
        .exactOptional(),
};

export const createReviewSchema = z.strictObject(
    {
        productId: idField("Product id"),
        ...reviewFields,
    },
    unrecognizedKeysError,
);

export const updateReviewSchema = z.strictObject(
    {
        rating: reviewFields.rating.exactOptional(),
        comment: reviewFields.comment,
        removeImage: z.stringbool({ error: "removeImage must be true or false" }).exactOptional(),
    },
    unrecognizedKeysError,
);

export const updateReviewStatusSchema = z.strictObject(
    {
        status: z.enum([ReviewStatus.APPROVED, ReviewStatus.REJECTED, ReviewStatus.PENDING], {
            error: "Status must be PENDING, APPROVED or REJECTED",
        }),
    },
    unrecognizedKeysError,
);

const ratingQuery = z.coerce
    .number({ error: "Rating must be a number" })
    .int({ error: "Rating must be a whole number" })
    .min(1, { error: "Rating must be between 1 and 5" })
    .max(5, { error: "Rating must be between 1 and 5" })
    .optional();

export const reviewSortOptions = ["newest", "oldest", "highest", "lowest"] as const;

export const getProductReviewsQuerySchema = paginationQuerySchema.extend({
    rating: ratingQuery,
    verified: booleanQuery("verified"),
    withImage: booleanQuery("withImage"),
    sort: z.enum(reviewSortOptions, { error: "Sort must be newest, oldest, highest or lowest" }).default("newest"),
});

export const getAllReviewsQuerySchema = paginationQuerySchema.extend({
    status: z.enum(ReviewStatus, { error: "Invalid review status" }).optional(),
    rating: ratingQuery,
    productId: z.string().trim().min(1).optional(),
    verified: booleanQuery("verified"),
    searchTerm: searchTermQuery,
    sort: z.enum(reviewSortOptions, { error: "Sort must be newest, oldest, highest or lowest" }).default("newest"),
});

export type CreateReviewPayload = z.infer<typeof createReviewSchema>;
export type UpdateReviewPayload = z.infer<typeof updateReviewSchema>;
export type UpdateReviewStatusPayload = z.infer<typeof updateReviewStatusSchema>;
export type GetProductReviewsQuery = z.infer<typeof getProductReviewsQuerySchema>;
export type GetAllReviewsQuery = z.infer<typeof getAllReviewsQuerySchema>;
export type ReviewSortOption = (typeof reviewSortOptions)[number];
