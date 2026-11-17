import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    APP_URL: z.url(),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    ADMIN_NAME: z.string().trim().min(1),
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(8),
    ADMIN_PHONE: z.string().trim().min(1),
    STORAGE_LOCAL_DIR: z.string().trim().min(1).default("./uploads"),
    STORAGE_PUBLIC_URL: z.url().transform((url) => url.replace(/\/+$/, "")),
    TELEGRAM_BOT_TOKEN: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .pipe(z.string().regex(/^\d+:[\w-]+$/, { error: "TELEGRAM_BOT_TOKEN must look like 123456789:ABC..." }).optional())
        .optional(),
    TELEGRAM_CHAT_ID: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .pipe(z.string().regex(/^-?\d+$/, { error: "TELEGRAM_CHAT_ID must be a number like -1001234567890" }).optional())
        .optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

const loadEnvVars = (): EnvConfig => {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error("Invalid environment variables:\n" + z.prettifyError(result.error));
        process.exit(1);
    }

    return result.data;
};

export const envVars = loadEnvVars();
