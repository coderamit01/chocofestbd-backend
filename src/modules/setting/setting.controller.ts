import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { settingService } from "./setting.service";
import { settingGroupParamSchema, settingImageParamSchema } from "./setting.validation";
import type { SettingFiles } from "./setting.interface";

export const settingController = {
    getPublicSettings: catchAsync(async (_req: Request, res: Response) => {
        const settings = await settingService.getPublicSettings();

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Settings retrieved successfully",
            data: settings,
        });
    }),

    getLegalPages: catchAsync(async (_req: Request, res: Response) => {
        const legal = await settingService.getLegalPages();

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Legal pages retrieved successfully",
            data: legal,
        });
    }),

    getAllSettings: catchAsync(async (_req: Request, res: Response) => {
        const settings = await settingService.getAllSettings();

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Settings retrieved successfully",
            data: settings,
        });
    }),

    getSettingGroup: catchAsync(async (req: Request, res: Response) => {
        const { group } = settingGroupParamSchema.parse(req.params);
        const setting = await settingService.getSettingGroup(group);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Settings retrieved successfully",
            data: setting,
        });
    }),

    updateSettingGroup: catchAsync(async (req: Request, res: Response) => {
        const { group } = settingGroupParamSchema.parse(req.params);
        const setting = await settingService.updateSettingGroup(group, req.body, req.user!.id);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Settings updated successfully",
            data: setting,
        });
    }),

    uploadSettingImages: catchAsync(async (req: Request, res: Response) => {
        const { group } = settingGroupParamSchema.parse(req.params);
        const setting = await settingService.uploadSettingImages(group, req.files as SettingFiles | undefined, req.user!.id);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Images uploaded successfully",
            data: setting,
        });
    }),

    removeSettingImage: catchAsync(async (req: Request, res: Response) => {
        const { group, field } = settingImageParamSchema.parse(req.params);
        const setting = await settingService.removeSettingImage(group, field, req.user!.id);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Image removed successfully",
            data: setting,
        });
    }),
};
