import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { notificationService } from "./notification.service";
import { getMyNotificationsQuerySchema, notificationIdParamSchema } from "./notification.validation";

export const notificationController = {
    getMyNotifications: catchAsync(async (req: Request, res: Response) => {
        const query = getMyNotificationsQuerySchema.parse(req.query);
        const { notifications, meta } = await notificationService.getMyNotifications(req.user!.id, query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Notifications retrieved successfully",
            data: notifications,
            meta,
        });
    }),

    getUnreadCount: catchAsync(async (req: Request, res: Response) => {
        const result = await notificationService.getUnreadCount(req.user!.id);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Unread count retrieved successfully",
            data: result,
        });
    }),

    markAsRead: catchAsync(async (req: Request, res: Response) => {
        const { notificationId } = notificationIdParamSchema.parse(req.params);
        const result = await notificationService.markAsRead(req.user!.id, notificationId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Notification marked as read",
            data: result,
        });
    }),

    markAsUnread: catchAsync(async (req: Request, res: Response) => {
        const { notificationId } = notificationIdParamSchema.parse(req.params);
        const result = await notificationService.markAsUnread(req.user!.id, notificationId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Notification marked as unread",
            data: result,
        });
    }),

    sendTelegramTest: catchAsync(async (req: Request, res: Response) => {
        const result = await notificationService.sendTelegramTest(req.user!.name);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Test message sent to Telegram",
            data: result,
        });
    }),

    markAllAsRead: catchAsync(async (req: Request, res: Response) => {
        const result = await notificationService.markAllAsRead(req.user!.id);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "All notifications marked as read",
            data: result,
        });
    }),
};
