import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { categoryService } from "./category.service";
import type { CategoryFiles } from "./category.interface";
import { categoryIdParamSchema, getAllCategoriesQuerySchema } from "./category.validation";

export const categoryController = {
    createCategory: catchAsync(async (req: Request, res: Response) => {
        const category = await categoryService.createCategory(req.body, req.files as CategoryFiles | undefined);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Category created successfully",
            data: category,
        });
    }),

    getAllCategories: catchAsync(async (req: Request, res: Response) => {
        const query = getAllCategoriesQuerySchema.parse(req.query);
        const { categories, meta } = await categoryService.getAllCategories(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Categories retrieved successfully",
            data: categories,
            meta,
        });
    }),

    getTrashedCategories: catchAsync(async (req: Request, res: Response) => {
        const query = getAllCategoriesQuerySchema.parse(req.query);
        const { categories, meta } = await categoryService.getTrashedCategories(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Trashed categories retrieved successfully",
            data: categories,
            meta,
        });
    }),

    getCategoryById: catchAsync(async (req: Request, res: Response) => {
        const { categoryId } = categoryIdParamSchema.parse(req.params);
        const category = await categoryService.getCategoryById(categoryId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Category retrieved successfully",
            data: category,
        });
    }),

    updateCategory: catchAsync(async (req: Request, res: Response) => {
        const { categoryId } = categoryIdParamSchema.parse(req.params);
        const category = await categoryService.updateCategory(categoryId, req.body, req.files as CategoryFiles | undefined);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Category updated successfully",
            data: category,
        });
    }),

    moveToTrash: catchAsync(async (req: Request, res: Response) => {
        const { categoryId } = categoryIdParamSchema.parse(req.params);
        await categoryService.moveToTrash(categoryId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Category moved to trash",
        });
    }),

    restoreCategory: catchAsync(async (req: Request, res: Response) => {
        const { categoryId } = categoryIdParamSchema.parse(req.params);
        const category = await categoryService.restoreCategory(categoryId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Category restored successfully",
            data: category,
        });
    }),

    hardDeleteCategory: catchAsync(async (req: Request, res: Response) => {
        const { categoryId } = categoryIdParamSchema.parse(req.params);
        await categoryService.hardDeleteCategory(categoryId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Category permanently deleted",
        });
    }),
};
