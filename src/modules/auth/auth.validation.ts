import * as z from "zod";

const emailSchema = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "A valid email is required" }));

export const signUpSchema = z.object({
  name: z
    .string({ error: "Name is required" }).trim().min(2),
  email: emailSchema,
  password: z
    .string({ error: "Password is required" })
    .min(8, { error: "Password must be at least 8 characters" })
    .max(128, { error: "Password must be at most 128 characters" }),
  phone: z
    .string({ error: "Phone number must be a string" })
    .trim()
    .regex(/^\+8801[3-9]\d{8}$/, { error: "Phone number must be in the format +8801XXXXXXXXX" })
    .optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: "Password is required" })
    .min(1, { error: "Password is required" })
    .max(128, { error: "Password must be at most 128 characters" }),
  rememberMe: z.boolean().optional(),
});

export const changePasswordSchema = z.object({
  newPassword: z
    .string({ error: "New password is required" })
    .min(8, { error: "Password must be at least 8 characters" })
    .max(128, { error: "Password must be at most 128 characters" }),
});

export type SignUpPayload = z.infer<typeof signUpSchema>;
export type SignInPayload = z.infer<typeof signInSchema>;
export type ChangePasswordPayload = z.infer<typeof changePasswordSchema>;
