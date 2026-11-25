import * as z from "zod";
import { UserRole } from "../../generated/prisma/enums";

export const inviteStaffSchema = z.strictObject(
    {
        name: z
            .string({ error: "Name is required" })
            .trim()
            .min(2, { error: "Name must be at least 2 characters" })
            .max(100, { error: "Name must be at most 100 characters" }),
        email: z.string({ error: "Email is required" }).trim().toLowerCase().pipe(z.email({ error: "Enter a valid email" })),
        phone: z
            .string({ error: "Phone number must be a string" })
            .trim()
            .transform((value) => value || null)
            .pipe(z.string().regex(/^01[3-9]\d{8}$/, { error: "Phone number must be in the format 01XXXXXXXXX" }).nullable())
            .exactOptional(),
        role: z.enum([UserRole.ADMIN, UserRole.MANAGER, UserRole.ORDER_HANDLER, UserRole.RIDER], {
            error: "Role must be ADMIN, MANAGER, ORDER_HANDLER or RIDER",
        }),
        password: z
            .string({ error: "Temporary password is required" })
            .min(8, { error: "Temporary password must be at least 8 characters" })
            .max(128, { error: "Temporary password must be at most 128 characters" }),
    },
    { error: (issue) => (issue.code === "unrecognized_keys" ? `Field not allowed: ${issue.keys.join(", ")}` : undefined) },
);

export type InviteStaffPayload = z.infer<typeof inviteStaffSchema>;
