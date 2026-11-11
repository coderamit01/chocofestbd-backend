import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { UserRole } from "../../generated/prisma/enums";
import { productService } from "./product.service";
import type { ProductFiles } from "./product.interface";
import {
    getAdminProductsQuerySchema,
    getAllProductsQuerySchema,
    getTrashedProductsQuerySchema,
    productIdParamSchema,
    productSlugParamSchema,
} from "./product.validation";

export const productController = {
    getAllProducts: catchAsync(async (req: Request, res: Response) => {
        const query = getAllProductsQuerySchema.parse(req.query);
        const { products, meta } = await productService.getAllProducts(query);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Products retrieved successfully",
            data: products,
            meta,
        });
    }),

    getAdminProducts: catchAsync(async (req: Request, res: Response) => {
        const query = getAdminProductsQuerySchema.parse(req.query);
        const role = req.user!.role as UserRole;
        const { products, meta } = await productService.getAdminProducts(query, role);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Products retrieved successfully",
            data: products,
            meta,
        });
    }),

    getProductById: catchAsync(async (req: Request, res: Response) => {
        const { productId } = productIdParamSchema.parse(req.params);
        const product = await productService.getProductById(productId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Product retrieved successfully",
            data: product,
        });
    }),

    getProductBySlug: catchAsync(async (req: Request, res: Response) => {
        const { slug } = productSlugParamSchema.parse(req.params);
        const product = await productService.getProductBySlug(slug);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Product retrieved successfully",
            data: product,
        });
    }),

    createProduct: catchAsync(async (req: Request, res: Response) => {
        const role = req.user!.role as UserRole;
        const product = await productService.createProduct(req.body, req.files as ProductFiles | undefined, role);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Product created successfully",
            data: product,
        });
    }),

    updateProduct: catchAsync(async (req: Request, res: Response) => {
        const { productId } = productIdParamSchema.parse(req.params);
        const role = req.user!.role as UserRole;
        const product = await productService.updateProduct(productId, req.body, req.files as ProductFiles | undefined, role);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Product updated successfully",
            data: product,
        });
    }),

    getTrashedProducts: catchAsync(async (req: Request, res: Response) => {
        const query = getTrashedProductsQuerySchema.parse(req.query);
        const { products, meta } = await productService.getTrashedProducts(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Trashed products retrieved successfully",
            data: products,
            meta,
        });
    }),

    restoreProduct: catchAsync(async (req: Request, res: Response) => {
        const { productId } = productIdParamSchema.parse(req.params);
        const product = await productService.restoreProduct(productId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Product restored successfully",
            data: product,
        });
    }),

    moveToTrash: catchAsync(async (req: Request, res: Response) => {
        const { productId } = productIdParamSchema.parse(req.params);
        await productService.moveToTrash(productId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Product moved to trash",
        });
    }),

    hardDeleteProduct: catchAsync(async (req: Request, res: Response) => {
        const { productId } = productIdParamSchema.parse(req.params);
        await productService.hardDeleteProduct(productId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Product permanently deleted",
        });
    }),
};
