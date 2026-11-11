import rateLimit from "express-rate-limit";

const createRateLimiter = (windowMinutes: number, limit: number, message: string) =>
    rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        limit,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        handler: (_req, res) => {
            res.status(429).json({ success: false, message });
        },
    });

export const signInLimiter = createRateLimiter(1, 5, "Too many sign-in attempts. Please try again in a minute");

export const signUpLimiter = createRateLimiter(60, 5, "Too many sign-up attempts. Please try again later");
