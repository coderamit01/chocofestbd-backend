import * as z from "zod";
import { NotificationSeverity } from "../../generated/prisma/enums";
import { paginationQuerySchema } from "../../shared/pagination";
import { booleanQuery } from "../../shared/filters";
import { NOTIFICATION_TYPE_KEYS, type NotificationType } from "./notification.constant";

export const notificationIdParamSchema = z.object({
    notificationId: z
        .string({ error: "Notification id is required" })
        .trim()
        .min(1, { error: "Notification id is required" }),
});

export const getMyNotificationsQuerySchema = paginationQuerySchema.extend({
    unreadOnly: booleanQuery("unreadOnly"),
    readOnly: booleanQuery("readOnly"),
    type: z
        .enum(NOTIFICATION_TYPE_KEYS as [NotificationType, ...NotificationType[]], { error: "Invalid notification type" })
        .optional(),
    severity: z.enum(NotificationSeverity, { error: "Invalid severity" }).optional(),
});

export type GetMyNotificationsQuery = z.infer<typeof getMyNotificationsQuerySchema>;
