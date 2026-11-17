import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { dashboardService } from "./dashboard.service";
import { dateRangeQuerySchema, salesChartQuerySchema } from "./dashboard.validation";

export const dashboardController = {
    getSummary: catchAsync(async (req: Request, res: Response) => {
        const query = dateRangeQuerySchema.parse(req.query);
        const result = await dashboardService.getSummary(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Dashboard summary retrieved successfully",
            data: result,
        });
    }),

    getSalesChart: catchAsync(async (req: Request, res: Response) => {
        const query = salesChartQuerySchema.parse(req.query);
        const result = await dashboardService.getSalesChart(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Sales chart retrieved successfully",
            data: result,
        });
    }),
};
