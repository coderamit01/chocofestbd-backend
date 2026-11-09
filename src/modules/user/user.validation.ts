import * as z from "zod";
import { UserRole } from "../../generated/prisma/enums";
import { paginationQuerySchema } from "../../shared/pagination";

export const getAllUsersQuerySchema = paginationQuerySchema.extend({
    searchTerm: z.string().trim().min(1).optional()
});

export const userIdParamSchema = z.object({
    userId: z.string({ error: "User id is required" }).trim().min(1, { error: "User id is required" }),
});

export const updateUserSchema = z.strictObject(
    {
        name: z
            .string({ error: "Name must be a string" })
            .trim()
            .min(2, { error: "Name must be at least 2 characters" })
            .max(100, { error: "Name must be at most 100 characters" })
            .exactOptional(),
        phone: z
            .string({ error: "Phone number must be a string" })
            .trim()
            .transform((value) => value || null)
            .pipe(z.string().regex(/^01[3-9]\d{8}$/, { error: "Phone number must be in the format 01XXXXXXXXX" }).nullable())
            .exactOptional(),
        address: z
            .string({ error: "Address must be a string" })
            .trim()
            .max(500, { error: "Address must be at most 500 characters" })
            .transform((value) => value || null)
            .exactOptional(),
        role: z.enum(UserRole, { error: "Invalid role" }).exactOptional(),
        isBanned: z.stringbool({ error: "isBanned must be true or false" }).exactOptional(),
    },
    { error: (issue) => (issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined) },
);

export type GetAllUsersQuery = z.infer<typeof getAllUsersQuerySchema>;
export type UpdateUserPayload = z.infer<typeof updateUserSchema>;
