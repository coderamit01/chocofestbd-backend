import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { cartService } from "./cart.service";
import { cartProductIdParamSchema } from "./cart.validation";

export const cartController = {
    getMyCart: catchAsync(async (req: Request, res: Response) => {
        const cart = await cartService.getMyCart(req.user!.id);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Cart retrieved successfully",
            data: cart,
        });
    }),

    addToCart: catchAsync(async (req: Request, res: Response) => {
        const cart = await cartService.addToCart(req.user!.id, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Product added to cart",
            data: cart,
        });
    }),

    updateCartItem: catchAsync(async (req: Request, res: Response) => {
        const { productId } = cartProductIdParamSchema.parse(req.params);
        const cart = await cartService.updateCartItem(req.user!.id, productId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Cart updated successfully",
            data: cart,
        });
    }),

    removeFromCart: catchAsync(async (req: Request, res: Response) => {
        const { productId } = cartProductIdParamSchema.parse(req.params);
        const cart = await cartService.removeFromCart(req.user!.id, productId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Product removed from cart",
            data: cart,
        });
    }),

    clearCart: catchAsync(async (req: Request, res: Response) => {
        await cartService.clearCart(req.user!.id);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Cart cleared successfully",
        });
    }),

    mergeCart: catchAsync(async (req: Request, res: Response) => {
        const result = await cartService.mergeCart(req.user!.id, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Cart merged successfully",
            data: result,
        });
    }),
};
