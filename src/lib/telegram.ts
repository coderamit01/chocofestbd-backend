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

export type TelegramStatus = {
    configured: boolean;
    botUsername: string | null;
    chatTitle: string | null;
};

const STATUS_TTL_MS = 5 * 60 * 1000;
let statusCache: { value: TelegramStatus; expiresAt: number } | null = null;

const callTelegram = async <T>(method: string, params: Record<string, string> = {}) => {
    const query = new URLSearchParams(params).toString();
    const response = await fetch(`${TELEGRAM_API}/bot${envVars.TELEGRAM_BOT_TOKEN}/${method}${query ? `?${query}` : ""}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; result?: T } | null;
    return body?.ok ? (body.result ?? null) : null;
};

export const getTelegramStatus = async (): Promise<TelegramStatus> => {
    if (!isTelegramConfigured()) {
        return { configured: false, botUsername: null, chatTitle: null };
    }

    if (statusCache && statusCache.expiresAt > Date.now()) {
        return statusCache.value;
    }

    const [bot, chat] = await Promise.all([
        callTelegram<{ username?: string }>("getMe").catch(() => null),
        callTelegram<{ title?: string; first_name?: string }>("getChat", { chat_id: String(envVars.TELEGRAM_CHAT_ID) }).catch(() => null),
    ]);

    const value = {
        configured: true,
        botUsername: bot?.username ?? null,
        chatTitle: chat?.title ?? chat?.first_name ?? null,
    };

    statusCache = { value, expiresAt: Date.now() + STATUS_TTL_MS };

    return value;
};
