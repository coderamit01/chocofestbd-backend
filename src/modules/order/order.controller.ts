import { Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { orderService } from "./order.service";
import {
    customerLookupQuerySchema,
    getAllOrdersQuerySchema,
    getMyOrdersQuerySchema,
    getPaymentsQuerySchema,
    invoiceIdsQuerySchema,
    orderCountsQuerySchema,
    orderIdParamSchema,
    trackOrderQuerySchema,
} from "./order.validation";

const sendData = <T>(res: Response, message: string, data: T, statusCode = 200) => {
    res.setHeader("Cache-Control", "no-store");
    sendResponse(res, { statusCode, success: true, message, data });
};

const getOptionalUserId = async (req: Request) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });

    return session?.user.id;
};

export const orderController = {
    previewCheckout: catchAsync(async (req: Request, res: Response) => {
        const preview = await orderService.previewCheckout(req.body, await getOptionalUserId(req));

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Checkout summary calculated",
            data: preview,
        });
    }),

    placeOrder: catchAsync(async (req: Request, res: Response) => {
        const result = await orderService.placeOrder(req.body, await getOptionalUserId(req));

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Order placed successfully",
            data: result,
        });
    }),

    trackOrder: catchAsync(async (req: Request, res: Response) => {
        const query = trackOrderQuerySchema.parse(req.query);
        const order = await orderService.trackOrder(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Order retrieved successfully",
            data: order,
        });
    }),

    getMyOrders: catchAsync(async (req: Request, res: Response) => {
        const query = getMyOrdersQuerySchema.parse(req.query);
        const { orders, meta } = await orderService.getMyOrders(req.user!.id, query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Orders retrieved successfully",
            data: orders,
            meta,
        });
    }),

    getMyOrderById: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = orderIdParamSchema.parse(req.params);
        const order = await orderService.getMyOrderById(req.user!.id, orderId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Order retrieved successfully",
            data: order,
        });
    }),

    getMyOrderInvoice: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = orderIdParamSchema.parse(req.params);
        const invoice = await orderService.getMyOrderInvoice(req.user!.id, orderId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Invoice retrieved successfully",
            data: invoice,
        });
    }),

    cancelMyOrder: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = orderIdParamSchema.parse(req.params);
        const order = await orderService.cancelMyOrder(req.user!.id, orderId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Order cancelled successfully",
            data: order,
        });
    }),

    getAllOrders: catchAsync(async (req: Request, res: Response) => {
        const query = getAllOrdersQuerySchema.parse(req.query);
        const { orders, meta } = await orderService.getAllOrders(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Orders retrieved successfully",
            data: orders,
            meta,
        });
    }),

    getOrderStatusCounts: catchAsync(async (req: Request, res: Response) => {
        const counts = await orderService.getOrderStatusCounts(orderCountsQuerySchema.parse(req.query));

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Order counts retrieved successfully",
            data: counts,
        });
    }),

    getOrderById: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = orderIdParamSchema.parse(req.params);
        const order = await orderService.getOrderById(orderId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Order retrieved successfully",
            data: order,
        });
    }),

    updateOrderStatus: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = orderIdParamSchema.parse(req.params);
        const order = await orderService.updateOrderStatus(orderId, req.body, req.user!.id);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Order status updated",
            data: order,
        });
    }),

    updatePaymentStatus: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = orderIdParamSchema.parse(req.params);
        const order = await orderService.updatePaymentStatus(orderId, req.body, req.user!.id);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Payment status updated",
            data: order,
        });
    }),

    getOrderSummary: catchAsync(async (_req: Request, res: Response) => {
        sendData(res, "Order summary retrieved successfully", await orderService.getOrderSummary());
    }),

    getOrderFilterOptions: catchAsync(async (_req: Request, res: Response) => {
        sendData(res, "Order filters retrieved successfully", await orderService.getOrderFilterOptions());
    }),

    getOrderFormOptions: catchAsync(async (_req: Request, res: Response) => {
        sendData(res, "Order form options retrieved successfully", await orderService.getOrderFormOptions());
    }),

    searchCustomers: catchAsync(async (req: Request, res: Response) => {
        const { searchTerm } = customerLookupQuerySchema.parse(req.query);
        sendData(res, "Customers retrieved successfully", await orderService.searchCustomers(searchTerm));
    }),

    createAdminOrder: catchAsync(async (req: Request, res: Response) => {
        const order = await orderService.createAdminOrder(req.body, req.user!.id);
        sendData(res, "Order created successfully", order, 201);
    }),

    bulkUpdateStatus: catchAsync(async (req: Request, res: Response) => {
        const result = await orderService.bulkUpdateStatus(req.body, req.user!.id);
        sendData(res, result.failed.length ? "Some orders could not be updated" : "Order status updated", result);
    }),

    getPayments: catchAsync(async (req: Request, res: Response) => {
        const query = getPaymentsQuerySchema.parse(req.query);
        const { payments, meta } = await orderService.getPayments(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Payments retrieved successfully",
            data: payments,
            meta,
        });
    }),

    getPaymentSummary: catchAsync(async (_req: Request, res: Response) => {
        sendData(res, "Payment summary retrieved successfully", await orderService.getPaymentSummary());
    }),

    rejectPayment: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = orderIdParamSchema.parse(req.params);
        sendData(res, "Payment rejected", await orderService.rejectPayment(orderId, req.body, req.user!.id));
    }),

    recordRefund: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = orderIdParamSchema.parse(req.params);
        sendData(res, "Refund recorded", await orderService.recordRefund(orderId, req.body, req.user!.id));
    }),

    getAdminInvoice: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = orderIdParamSchema.parse(req.params);
        sendData(res, "Invoice retrieved successfully", await orderService.getAdminInvoice(orderId));
    }),

    getAdminInvoices: catchAsync(async (req: Request, res: Response) => {
        const { ids } = invoiceIdsQuerySchema.parse(req.query);
        sendData(res, "Invoices retrieved successfully", await orderService.getAdminInvoices(ids));
    }),

    updateAdminNote: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = orderIdParamSchema.parse(req.params);
        const order = await orderService.updateAdminNote(orderId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Admin note updated",
            data: order,
        });
    }),
};
