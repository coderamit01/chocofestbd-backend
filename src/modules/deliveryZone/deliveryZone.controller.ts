import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { deliveryZoneService } from "./deliveryZone.service";
import { deliveryZoneIdParamSchema, getAllDeliveryZonesQuerySchema } from "./deliveryZone.validation";

export const deliveryZoneController = {
    createDeliveryZone: catchAsync(async (req: Request, res: Response) => {
        const zone = await deliveryZoneService.createDeliveryZone(req.body);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Delivery zone created successfully",
            data: zone,
        });
    }),

    getPublicDeliveryZones: catchAsync(async (_req: Request, res: Response) => {
        const zones = await deliveryZoneService.getPublicDeliveryZones();

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Delivery zones retrieved successfully",
            data: zones,
        });
    }),

    getAllDeliveryZones: catchAsync(async (req: Request, res: Response) => {
        const query = getAllDeliveryZonesQuerySchema.parse(req.query);
        const { zones, meta } = await deliveryZoneService.getAllDeliveryZones(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Delivery zones retrieved successfully",
            data: zones,
            meta,
        });
    }),

    getDeliveryZoneById: catchAsync(async (req: Request, res: Response) => {
        const { zoneId } = deliveryZoneIdParamSchema.parse(req.params);
        const zone = await deliveryZoneService.getDeliveryZoneById(zoneId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Delivery zone retrieved successfully",
            data: zone,
        });
    }),

    updateDeliveryZone: catchAsync(async (req: Request, res: Response) => {
        const { zoneId } = deliveryZoneIdParamSchema.parse(req.params);
        const zone = await deliveryZoneService.updateDeliveryZone(zoneId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Delivery zone updated successfully",
            data: zone,
        });
    }),

    deleteDeliveryZone: catchAsync(async (req: Request, res: Response) => {
        const { zoneId } = deliveryZoneIdParamSchema.parse(req.params);
        await deliveryZoneService.deleteDeliveryZone(zoneId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Delivery zone deleted successfully",
        });
    }),
};
