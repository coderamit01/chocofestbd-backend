import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { brandService } from "./brand.service";
import type { BrandFiles } from "./brand.interface";
import { brandIdParamSchema, getAllBrandsQuerySchema } from "./brand.validation";

export const brandController = {
    createBrand: catchAsync(async (req: Request, res: Response) => {
        const brand = await brandService.createBrand(req.body, req.files as BrandFiles | undefined);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Brand created successfully",
            data: brand,
        });
    }),

    getAllBrands: catchAsync(async (req: Request, res: Response) => {
        const query = getAllBrandsQuerySchema.parse(req.query);
        const { brands, meta } = await brandService.getAllBrands(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Brands retrieved successfully",
            data: brands,
            meta,
        });
    }),

    getTrashedBrands: catchAsync(async (req: Request, res: Response) => {
        const query = getAllBrandsQuerySchema.parse(req.query);
        const { brands, meta } = await brandService.getTrashedBrands(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Trashed brands retrieved successfully",
            data: brands,
            meta,
        });
    }),

    getBrandById: catchAsync(async (req: Request, res: Response) => {
        const { brandId } = brandIdParamSchema.parse(req.params);
        const brand = await brandService.getBrandById(brandId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Brand retrieved successfully",
            data: brand,
        });
    }),

    updateBrand: catchAsync(async (req: Request, res: Response) => {
        const { brandId } = brandIdParamSchema.parse(req.params);
        const brand = await brandService.updateBrand(brandId, req.body, req.files as BrandFiles | undefined);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Brand updated successfully",
            data: brand,
        });
    }),

    moveToTrash: catchAsync(async (req: Request, res: Response) => {
        const { brandId } = brandIdParamSchema.parse(req.params);
        await brandService.moveToTrash(brandId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Brand moved to trash",
        });
    }),

    restoreBrand: catchAsync(async (req: Request, res: Response) => {
        const { brandId } = brandIdParamSchema.parse(req.params);
        const brand = await brandService.restoreBrand(brandId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Brand restored successfully",
            data: brand,
        });
    }),

    hardDeleteBrand: catchAsync(async (req: Request, res: Response) => {
        const { brandId } = brandIdParamSchema.parse(req.params);
        await brandService.hardDeleteBrand(brandId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Brand permanently deleted",
        });
    }),
};
