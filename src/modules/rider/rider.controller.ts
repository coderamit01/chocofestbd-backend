import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { riderService } from "./rider.service";
import { riderOrderIdParamSchema } from "./rider.validation";

export const riderController = {
    getMyDeliveries: catchAsync(async (req: Request, res: Response) => {
        const deliveries = await riderService.getMyDeliveries(req.user!.id);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Deliveries retrieved successfully",
            data: deliveries,
        });
    }),

    markDelivered: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = riderOrderIdParamSchema.parse(req.params);
        await riderService.markDelivered(orderId, req.user!.id, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Order marked as delivered",
        });
    }),

    markFailed: catchAsync(async (req: Request, res: Response) => {
        const { orderId } = riderOrderIdParamSchema.parse(req.params);
        await riderService.markFailed(orderId, req.user!.id, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Failed delivery reported",
        });
    }),
};
