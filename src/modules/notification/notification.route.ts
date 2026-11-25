import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { notificationController } from "./notification.controller";
import { STAFF_ROLES } from "./notification.constant";


const router = Router();

router.get("/", Authentication(...STAFF_ROLES), notificationController.getMyNotifications);
router.get("/unread-count", Authentication(...STAFF_ROLES), notificationController.getUnreadCount);
router.post("/telegram/test", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), notificationController.sendTelegramTest);
router.patch("/read-all", Authentication(...STAFF_ROLES), notificationController.markAllAsRead);
router.patch("/:notificationId/read", Authentication(...STAFF_ROLES), notificationController.markAsRead);
router.patch("/:notificationId/unread", Authentication(...STAFF_ROLES), notificationController.markAsUnread);


export const notificationRoutes = router;
