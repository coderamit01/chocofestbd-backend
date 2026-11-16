import { envVars } from "../config/env";
import { AppError } from "../helpers/AppError";

const TELEGRAM_API = "https://api.telegram.org";
const TIMEOUT_MS = 5000;
const MAX_LENGTH = 4000;

export const isTelegramConfigured = () => Boolean(envVars.TELEGRAM_BOT_TOKEN && envVars.TELEGRAM_CHAT_ID);

export const escapeTelegramHtml = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const sendTelegramMessage = async (html: string) => {
    if (!isTelegramConfigured()) {
        throw new AppError("Telegram is not configured. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env", 400);
    }

    const response = await fetch(`${TELEGRAM_API}/bot${envVars.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: envVars.TELEGRAM_CHAT_ID,
            text: html.slice(0, MAX_LENGTH),
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const result = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;

    if (!response.ok || !result?.ok) {
        throw new AppError(`Telegram error: ${result?.description ?? `HTTP ${response.status}`}`, 502);
    }
};
