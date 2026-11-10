import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { productService } from "./product.service";
import type { ProductFiles } from "./product.interface";

export const productController = {
    createProduct: catchAsync(async (req: Request, res: Response) => {
        const product = await productService.createProduct(req.body, req.files as ProductFiles | undefined);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Product created successfully",
            data: product,
        });
    }),
};
