import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { wishlistService } from "./wishlist.service";
import { getWishlistQuerySchema, wishlistProductIdParamSchema } from "./wishlist.validation";

export const wishlistController = {
    addToWishlist: catchAsync(async (req: Request, res: Response) => {
        const wishlistItem = await wishlistService.addToWishlist(req.user!.id, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Product added to wishlist",
            data: wishlistItem,
        });
    }),

    getMyWishlist: catchAsync(async (req: Request, res: Response) => {
        const query = getWishlistQuerySchema.parse(req.query);
        const { wishlist, meta } = await wishlistService.getMyWishlist(req.user!.id, query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Wishlist retrieved successfully",
            data: wishlist,
            meta,
        });
    }),

    getMyWishlistProductIds: catchAsync(async (req: Request, res: Response) => {
        const productIds = await wishlistService.getMyWishlistProductIds(req.user!.id);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Wishlist product ids retrieved successfully",
            data: productIds,
        });
    }),

    removeFromWishlist: catchAsync(async (req: Request, res: Response) => {
        const { productId } = wishlistProductIdParamSchema.parse(req.params);
        await wishlistService.removeFromWishlist(req.user!.id, productId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Product removed from wishlist",
        });
    }),

    mergeWishlist: catchAsync(async (req: Request, res: Response) => {
        const result = await wishlistService.mergeWishlist(req.user!.id, req.body);
        const productWord = result.added === 1 ? "product" : "products";

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: `${result.added} ${productWord} added to your wishlist`,
            data: result,
        });
    }),
};
