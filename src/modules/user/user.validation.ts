import * as z from "zod";
import { UserRole } from "../../generated/prisma/enums";
import { paginationQuerySchema } from "../../shared/pagination";
import { booleanQuery, searchTermQuery } from "../../shared/filters";

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
        role: z.enum(UserRole, { error: "Invalid role" }).exactOptional(),
        isBanned: z.stringbool({ error: "isBanned must be true or false" }).exactOptional(),
    },
    { error: (issue) => (issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined) },
);

export const customerSortOptions = ["newest", "orders", "spent"] as const;

export const getCustomersQuerySchema = paginationQuerySchema.extend({
    searchTerm: searchTermQuery,
    joinedWithinDays: z.coerce
        .number({ error: "joinedWithinDays must be a number" })
        .int({ error: "joinedWithinDays must be a whole number" })
        .min(1, { error: "joinedWithinDays must be at least 1" })
        .max(3650, { error: "joinedWithinDays must be at most 3650" })
        .optional(),
    hasOrders: booleanQuery("hasOrders"),
    status: z.enum(["active", "banned"], { error: "Status must be active or banned" }).optional(),
    sortBy: z.enum(customerSortOptions, { error: "Sort must be newest, orders or spent" }).default("newest"),
    sortOrder: z.enum(["asc", "desc"], { error: "Sort order must be asc or desc" }).default("desc"),
});

export const adjustPointsSchema = z.strictObject(
    {
        delta: z
            .number({ error: "Points must be a number" })
            .int({ error: "Points must be a whole number" })
            .min(-1_000_000, { error: "Points change is too large" })
            .max(1_000_000, { error: "Points change is too large" })
            .refine((value) => value !== 0, { error: "Enter a number of points" }),
        reason: z
            .string({ error: "Reason is required" })
            .trim()
            .min(2, { error: "Add a reason" })
            .max(200, { error: "Reason must be at most 200 characters" }),
    },
    { error: (issue) => (issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined) },
);

export type GetAllUsersQuery = z.infer<typeof getAllUsersQuerySchema>;
export type UpdateUserPayload = z.infer<typeof updateUserSchema>;
export type GetCustomersQuery = z.infer<typeof getCustomersQuerySchema>;
export type AdjustPointsPayload = z.infer<typeof adjustPointsSchema>;
