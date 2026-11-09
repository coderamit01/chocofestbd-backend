import * as z from "zod";
import { paginationQuerySchema } from "../../shared/pagination";

const unrecognizedKeysError = {
    error: (issue: z.core.$ZodRawIssue) =>
        issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined,
};

export const faqIdParamSchema = z.object({
    faqId: z.string({ error: "FAQ id is required" }).trim().min(1, { error: "FAQ id is required" }),
});

const faqFields = {
    question: z
        .string({ error: "Question is required" })
        .trim()
        .min(5, { error: "Question must be at least 5 characters" })
        .max(300, { error: "Question must be at most 300 characters" }),
    answer: z
        .string({ error: "Answer is required" })
        .trim()
        .min(2, { error: "Answer must be at least 2 characters" })
        .max(5000, { error: "Answer must be at most 5000 characters" }),
    sortOrder: z
        .number({ error: "Sort order must be a number" })
        .int({ error: "Sort order must be a whole number" })
        .min(0, { error: "Sort order cannot be negative" }),
    isActive: z.boolean({ error: "isActive must be true or false" }),
};

export const createFaqSchema = z.strictObject(
    {
        question: faqFields.question,
        answer: faqFields.answer,
        sortOrder: faqFields.sortOrder.exactOptional(),
        isActive: faqFields.isActive.exactOptional(),
    },
    unrecognizedKeysError,
);

export const updateFaqSchema = z
    .strictObject(
        {
            question: faqFields.question.exactOptional(),
            answer: faqFields.answer.exactOptional(),
            sortOrder: faqFields.sortOrder.exactOptional(),
            isActive: faqFields.isActive.exactOptional(),
        },
        unrecognizedKeysError,
    )
    .refine((data) => Object.keys(data).length > 0, { error: "Provide at least one field to update" });

export const getAllFaqsQuerySchema = paginationQuerySchema.extend({
    isActive: z
        .enum(["true", "false"], { error: "isActive must be true or false" })
        .transform((value) => value === "true")
        .optional(),
    searchTerm: z.string().trim().min(1).optional(),
});

export type CreateFaqPayload = z.infer<typeof createFaqSchema>;
export type UpdateFaqPayload = z.infer<typeof updateFaqSchema>;
export type GetAllFaqsQuery = z.infer<typeof getAllFaqsQuerySchema>;
