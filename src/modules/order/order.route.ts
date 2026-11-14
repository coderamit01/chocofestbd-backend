import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { orderController } from "./order.controller";
import {
    cancelMyOrderSchema,
    checkoutPreviewSchema,
    checkoutSchema,
    updateAdminNoteSchema,
    updateOrderStatusSchema,
} from "./order.validation";


const router = Router();

const orderStaff = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ORDER_HANDLER];

router.post("/preview", validateRequest(checkoutPreviewSchema), orderController.previewCheckout);
router.post("/", validateRequest(checkoutSchema), orderController.placeOrder);
router.get("/track", orderController.trackOrder);

router.get("/my", Authentication(), orderController.getMyOrders);
router.get("/my/:orderId", Authentication(), orderController.getMyOrderById);
router.patch("/my/:orderId/cancel", Authentication(), validateRequest(cancelMyOrderSchema), orderController.cancelMyOrder);

router.get("/admin", Authentication(...orderStaff), orderController.getAllOrders);
router.get("/admin/counts", Authentication(...orderStaff), orderController.getOrderStatusCounts);
router.get("/admin/:orderId", Authentication(...orderStaff), orderController.getOrderById);
router.patch("/admin/:orderId/status", Authentication(...orderStaff), validateRequest(updateOrderStatusSchema), orderController.updateOrderStatus);
router.patch("/admin/:orderId/note", Authentication(...orderStaff), validateRequest(updateAdminNoteSchema), orderController.updateAdminNote);


export const orderRoutes = router;
