import type { Request } from "express";
import { notify } from "../modules/notification/notification.service";

const ALERT_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED = 500;
const SKIPPED_STATUS = new Set([503]);
const SKIPPED_PATHS = ["/api/v1/notifications/telegram"];

const lastAlertAt = new Map<string, number>();

const pruneOld = (now: number) => {
    if (lastAlertAt.size < MAX_TRACKED) return;

    for (const [key, time] of lastAlertAt) {
        if (now - time > ALERT_WINDOW_MS) lastAlertAt.delete(key);
    }
};

export const alertServerError = (req: Request, statusCode: number, err: unknown) => {
    const path = req.originalUrl.split("?")[0] ?? req.originalUrl;

    if (SKIPPED_STATUS.has(statusCode) || SKIPPED_PATHS.some((skipped) => path.startsWith(skipped))) {
        return;
    }

    const name = err instanceof Error ? err.name : "Error";
    const message = err instanceof Error ? err.message : String(err);
    const key = `${req.method} ${path} ${name}: ${message}`;
    const now = Date.now();
    const last = lastAlertAt.get(key);

    if (last && now - last < ALERT_WINDOW_MS) return;

    pruneOld(now);
    lastAlertAt.set(key, now);

    void notify("system.error", {
        title: `Server error ${statusCode}`,
        message: `${req.method} ${path}\n${name}: ${message}`.slice(0, 1000),
        data: { method: req.method, path, statusCode },
    });
};
