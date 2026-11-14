import { Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { orderService } from "./order.service";
import {
    getAllOrdersQuerySchema,
    getMyOrdersQuerySchema,
    orderIdParamSchema,
    trackOrderQuerySchema,
} from "./order.validation";

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

    getOrderStatusCounts: catchAsync(async (_req: Request, res: Response) => {
        const counts = await orderService.getOrderStatusCounts();

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
