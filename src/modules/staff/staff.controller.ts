import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { staffService } from "./staff.service";

export const staffController = {
    getStaff: catchAsync(async (_req: Request, res: Response) => {
        const staff = await staffService.getStaff();

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Staff retrieved successfully",
            data: staff,
        });
    }),

    inviteStaff: catchAsync(async (req: Request, res: Response) => {
        const user = await staffService.inviteStaff(req.body);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Staff member added",
            data: user,
        });
    }),
};
