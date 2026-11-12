import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { envVars } from "../config/env";
import { AppError } from "../helpers/AppError";
import { Prisma } from "../generated/prisma/client";
import { MAX_FILES } from "./upload";

export const errorHandler = (err: any, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: err.issues.map((issue) => ({
                field: issue.path.join("."),
                message: issue.message,
            })),
        });
    }

    if (err instanceof MulterError) {
        const multerMessages: Partial<Record<MulterError["code"], string>> = {
            LIMIT_FILE_SIZE: "Each image must be 5 MB or smaller",
            LIMIT_FILE_COUNT: `You can upload at most ${MAX_FILES} images`,
            LIMIT_UNEXPECTED_FILE: `Unexpected file field: ${err.field}`,
        };

        return res.status(400).json({
            success: false,
            message: multerMessages[err.code] ?? err.message,
        });
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const prismaErrors: Record<string, { statusCode: number; message: string }> = {
            P2002: { statusCode: 409, message: "A record with this value already exists" },
            P2003: { statusCode: 409, message: "This record is linked to other data" },
            P2025: { statusCode: 404, message: "Record not found" },
        };

        const mapped = prismaErrors[err.code];

        if (mapped) {
            return res.status(mapped.statusCode).json({ success: false, message: mapped.message });
        }
    }

    const statusCode: number = err.statusCode ?? err.status ?? 500;
    const isServerError = statusCode >= 500;

    if (isServerError) {
        console.error(`[${req.method} ${req.originalUrl}]`, err);
    }

    const isSafeMessage = err instanceof AppError || !isServerError;
    const showRealMessage = isSafeMessage || envVars.NODE_ENV === "development";

    res.status(statusCode).json({
        success: false,
        message: showRealMessage && err.message ? err.message : "Something went wrong. Please try again later",
    });
};
