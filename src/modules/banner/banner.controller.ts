import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { bannerService } from "./banner.service";
import {
    bannerCategoryIdParamSchema,
    bannerIdParamSchema,
    getAllBannersQuerySchema,
    getPublicBannersQuerySchema,
} from "./banner.validation";

export const bannerController = {
    createBannerCategory: catchAsync(async (req: Request, res: Response) => {
        const category = await bannerService.createBannerCategory(req.body);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Banner category created successfully",
            data: category,
        });
    }),

    getAllBannerCategories: catchAsync(async (_req: Request, res: Response) => {
        const categories = await bannerService.getAllBannerCategories();

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Banner categories retrieved successfully",
            data: categories,
        });
    }),

    getBannerCategoryById: catchAsync(async (req: Request, res: Response) => {
        const { categoryId } = bannerCategoryIdParamSchema.parse(req.params);
        const category = await bannerService.getBannerCategoryById(categoryId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Banner category retrieved successfully",
            data: category,
        });
    }),

    updateBannerCategory: catchAsync(async (req: Request, res: Response) => {
        const { categoryId } = bannerCategoryIdParamSchema.parse(req.params);
        const category = await bannerService.updateBannerCategory(categoryId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Banner category updated successfully",
            data: category,
        });
    }),

    deleteBannerCategory: catchAsync(async (req: Request, res: Response) => {
        const { categoryId } = bannerCategoryIdParamSchema.parse(req.params);
        await bannerService.deleteBannerCategory(categoryId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Banner category deleted successfully",
        });
    }),

    createBanner: catchAsync(async (req: Request, res: Response) => {
        const banner = await bannerService.createBanner(req.body, req.file);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Banner created successfully",
            data: banner,
        });
    }),

    getAllBanners: catchAsync(async (req: Request, res: Response) => {
        const query = getAllBannersQuerySchema.parse(req.query);
        const { banners, meta } = await bannerService.getAllBanners(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Banners retrieved successfully",
            data: banners,
            meta,
        });
    }),

    getBannerById: catchAsync(async (req: Request, res: Response) => {
        const { bannerId } = bannerIdParamSchema.parse(req.params);
        const banner = await bannerService.getBannerById(bannerId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Banner retrieved successfully",
            data: banner,
        });
    }),

    updateBanner: catchAsync(async (req: Request, res: Response) => {
        const { bannerId } = bannerIdParamSchema.parse(req.params);
        const banner = await bannerService.updateBanner(bannerId, req.body, req.file);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Banner updated successfully",
            data: banner,
        });
    }),

    deleteBanner: catchAsync(async (req: Request, res: Response) => {
        const { bannerId } = bannerIdParamSchema.parse(req.params);
        await bannerService.deleteBanner(bannerId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Banner deleted successfully",
        });
    }),

    getPublicBanners: catchAsync(async (req: Request, res: Response) => {
        const query = getPublicBannersQuerySchema.parse(req.query);
        const banners = await bannerService.getPublicBanners(query);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Banners retrieved successfully",
            data: banners,
        });
    }),
}
