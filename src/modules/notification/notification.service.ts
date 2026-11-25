import { prisma } from "../../lib/prisma";
import { AppError } from "../../helpers/AppError";
import type { Prisma } from "../../generated/prisma/client";
import { getPagination, paginationMeta } from "../../shared/pagination";
import { envVars } from "../../config/env";
import { NotificationSeverity } from "../../generated/prisma/enums";
import { escapeTelegramHtml, isTelegramConfigured, sendTelegramMessage } from "../../lib/telegram";
import { getSetting } from "../setting/setting.service";
import { NOTIFICATION_TYPES, type NotificationType } from "./notification.constant";
import type { GetMyNotificationsQuery } from "./notification.validation";

export type NotifyPayload = {
    title: string;
    message: string;
    link?: string;
    data?: Prisma.InputJsonValue;
};

const RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const notificationSelect = {
    readAt: true,
    notification: {
        select: {
            id: true,
            type: true,
            title: true,
            message: true,
            link: true,
            severity: true,
            data: true,
            createdAt: true,
        },
    },
} satisfies Prisma.NotificationRecipientSelect;

type RecipientRow = Prisma.NotificationRecipientGetPayload<{ select: typeof notificationSelect }>;

const toNotificationView = ({ readAt, notification }: RecipientRow) => ({
    ...notification,
    isRead: readAt !== null,
    readAt,
});

const findRecipientIds = async (type: NotificationType) => {
    const users = await prisma.user.findMany({
        where: { role: { in: [...NOTIFICATION_TYPES[type].roles] }, deletedAt: null, isBanned: false },
        select: { id: true },
    });

    return users.map((user) => user.id);
};

const createNotification = async (type: NotificationType, payload: NotifyPayload) => {
    const userIds = await findRecipientIds(type);

    if (!userIds.length) {
        return null;
    }

    return prisma.notification.create({
        data: {
            type,
            title: payload.title,
            message: payload.message,
            link: payload.link ?? null,
            severity: NOTIFICATION_TYPES[type].severity,
            ...(payload.data !== undefined && { data: payload.data }),
            recipients: { createMany: { data: userIds.map((userId) => ({ userId })) } },
        },
        select: { id: true },
    });
};

const severityIcons: Record<NotificationSeverity, string> = {
    [NotificationSeverity.INFO]: "🔔",
    [NotificationSeverity.WARNING]: "⚠️",
    [NotificationSeverity.CRITICAL]: "🚨",
};

const toAbsoluteLink = (link: string) => (/^https?:\/\//i.test(link) ? link : `${envVars.APP_URL.replace(/\/+$/, "")}${link}`);

const formatTelegramMessage = (type: NotificationType, payload: NotifyPayload) => {
    const lines = [
        `${severityIcons[NOTIFICATION_TYPES[type].severity]} <b>${escapeTelegramHtml(payload.title)}</b>`,
        escapeTelegramHtml(payload.message),
    ];

    if (payload.link) {
        lines.push(`<a href="${escapeTelegramHtml(toAbsoluteLink(payload.link))}">Open in dashboard</a>`);
    }

    return lines.join("\n\n");
};

const sendTelegram = async (type: NotificationType, payload: NotifyPayload) => {
    if (!isTelegramConfigured()) return;

    const settings = await getSetting("notifications");

    if (!settings.telegramEnabled || !settings.events[type].telegram) return;

    await sendTelegramMessage(formatTelegramMessage(type, payload));
};

export const notify = async (type: NotificationType, payload: NotifyPayload) => {
    const results = await Promise.allSettled([createNotification(type, payload), sendTelegram(type, payload)]);

    results.forEach((result, index) => {
        if (result.status === "rejected") {
            console.error(`Failed to send "${type}" notification to ${index === 0 ? "dashboard" : "Telegram"}:`, result.reason);
        }
    });
};

export const notificationService = {
    getMyNotifications: async (userId: string, query: GetMyNotificationsQuery) => {
        const where: Prisma.NotificationRecipientWhereInput = {
            userId,
            ...(query.unreadOnly && { readAt: null }),
            ...(query.readOnly && !query.unreadOnly && { readAt: { not: null } }),
            ...((query.type || query.severity) && {
                notification: {
                    ...(query.type && { type: query.type }),
                    ...(query.severity && { severity: query.severity }),
                },
            }),
        };

        const [rows, total] = await prisma.$transaction([
            prisma.notificationRecipient.findMany({
                where,
                select: notificationSelect,
                orderBy: { createdAt: "desc" },
                ...getPagination(query),
            }),
            prisma.notificationRecipient.count({ where }),
        ]);

        return { notifications: rows.map(toNotificationView), meta: paginationMeta(query, total) };
    },

    getUnreadCount: async (userId: string) => {
        const count = await prisma.notificationRecipient.count({ where: { userId, readAt: null } });
        return { count };
    },

    markAsRead: async (userId: string, notificationId: string) => {
        const row = await prisma.notificationRecipient.findUnique({
            where: { notificationId_userId: { notificationId, userId } },
            select: { readAt: true },
        });

        if (!row) {
            throw new AppError("Notification not found", 404);
        }

        if (row.readAt) {
            return { readAt: row.readAt };
        }

        const readAt = new Date();

        await prisma.notificationRecipient.update({
            where: { notificationId_userId: { notificationId, userId } },
            data: { readAt },
        });

        return { readAt };
    },

    markAsUnread: async (userId: string, notificationId: string) => {
        const row = await prisma.notificationRecipient.findUnique({
            where: { notificationId_userId: { notificationId, userId } },
            select: { readAt: true },
        });

        if (!row) {
            throw new AppError("Notification not found", 404);
        }

        if (row.readAt) {
            await prisma.notificationRecipient.update({
                where: { notificationId_userId: { notificationId, userId } },
                data: { readAt: null },
            });
        }

        return { readAt: null };
    },

    markAllAsRead: async (userId: string) => {
        const { count } = await prisma.notificationRecipient.updateMany({
            where: { userId, readAt: null },
            data: { readAt: new Date() },
        });

        return { updated: count };
    },

    sendTelegramTest: async (senderName: string) => {
        await sendTelegramMessage(
            `✅ <b>Telegram is connected</b>\n\nTest message sent by ${escapeTelegramHtml(senderName)} from the ChocoFest BD dashboard.`,
        );

        return { sent: true };
    },

    deleteOldNotifications: async () => {
        const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS);

        const { count } = await prisma.notification.deleteMany({
            where: {
                createdAt: { lt: cutoff },
                recipients: { none: { readAt: null } },
            },
        });

        return { deleted: count };
    },
};
