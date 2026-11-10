import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { locationService } from "./location.service";
import { districtParamSchema } from "./location.validation";

export const locationController = {
    getDistricts: catchAsync(async (_req: Request, res: Response) => {
        const districts = locationService.getDistricts();

        res.setHeader("Cache-Control", "public, max-age=86400");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Districts retrieved successfully",
            data: districts,
        });
    }),

    getThanas: catchAsync(async (req: Request, res: Response) => {
        const { district } = districtParamSchema.parse(req.params);
        const thanas = locationService.getThanas(district);

        res.setHeader("Cache-Control", "public, max-age=86400");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Thanas retrieved successfully",
            data: thanas,
        });
    }),
};
