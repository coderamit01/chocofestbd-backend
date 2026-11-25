import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { orderController } from "./order.controller";
import {
    adminCreateOrderSchema,
    bulkOrderStatusSchema,
    recordRefundSchema,
    rejectPaymentSchema,
    cancelMyOrderSchema,
    checkoutPreviewSchema,
    checkoutSchema,
    updateAdminNoteSchema,
    updateOrderStatusSchema,
    updatePaymentStatusSchema,
} from "./order.validation";


const router = Router();

const orderStaff = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ORDER_HANDLER];

router.post("/preview", validateRequest(checkoutPreviewSchema), orderController.previewCheckout);
router.post("/", validateRequest(checkoutSchema), orderController.placeOrder);
router.get("/track", orderController.trackOrder);

router.get("/my", Authentication(), orderController.getMyOrders);
router.get("/my/:orderId", Authentication(), orderController.getMyOrderById);
router.get("/my/:orderId/invoice", Authentication(), orderController.getMyOrderInvoice);
router.patch("/my/:orderId/cancel", Authentication(), validateRequest(cancelMyOrderSchema), orderController.cancelMyOrder);

router.get("/admin", Authentication(...orderStaff), orderController.getAllOrders);
router.post("/admin", Authentication(...orderStaff), validateRequest(adminCreateOrderSchema), orderController.createAdminOrder);
router.get("/admin/counts", Authentication(...orderStaff), orderController.getOrderStatusCounts);
router.get("/admin/summary", Authentication(...orderStaff), orderController.getOrderSummary);
router.get("/admin/filters", Authentication(...orderStaff), orderController.getOrderFilterOptions);
router.get("/admin/form-options", Authentication(...orderStaff), orderController.getOrderFormOptions);
router.get("/admin/customers", Authentication(...orderStaff), orderController.searchCustomers);
router.get("/admin/invoices", Authentication(...orderStaff), orderController.getAdminInvoices);
router.get("/admin/payments", Authentication(...orderStaff), orderController.getPayments);
router.get("/admin/payments/summary", Authentication(...orderStaff), orderController.getPaymentSummary);
router.patch("/admin/status", Authentication(...orderStaff), validateRequest(bulkOrderStatusSchema), orderController.bulkUpdateStatus);
router.get("/admin/:orderId", Authentication(...orderStaff), orderController.getOrderById);
router.get("/admin/:orderId/invoice", Authentication(...orderStaff), orderController.getAdminInvoice);
router.patch("/admin/:orderId/payment/reject", Authentication(...orderStaff), validateRequest(rejectPaymentSchema), orderController.rejectPayment);
router.patch("/admin/:orderId/refund", Authentication(...orderStaff), validateRequest(recordRefundSchema), orderController.recordRefund);
router.patch("/admin/:orderId/status", Authentication(...orderStaff), validateRequest(updateOrderStatusSchema), orderController.updateOrderStatus);
router.patch("/admin/:orderId/payment", Authentication(...orderStaff), validateRequest(updatePaymentStatusSchema), orderController.updatePaymentStatus);
router.patch("/admin/:orderId/note", Authentication(...orderStaff), validateRequest(updateAdminNoteSchema), orderController.updateAdminNote);


export const orderRoutes = router;
