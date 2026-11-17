import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth";
import { UserRole } from "../generated/prisma/enums";
import { getSetting } from "../modules/setting/setting.service";

const ALWAYS_OPEN = ["/settings"];

const isAlwaysOpen = (path: string) => ALWAYS_OPEN.some((open) => path === open || path.startsWith(`${open}/`));

export const maintenanceGuard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const maintenance = await getSetting("maintenance");

        if (!maintenance.enabled || isAlwaysOpen(req.path)) {
            return next();
        }

        const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

        if (session && session.user.role !== UserRole.CUSTOMER) {
            return next();
        }

        res.setHeader("Retry-After", "3600");
        res.setHeader("Cache-Control", "no-store");

        return res.status(503).json({
            success: false,
            maintenance: true,
            message: maintenance.message,
        });
    } catch (error) {
        next(error);
    }
};
