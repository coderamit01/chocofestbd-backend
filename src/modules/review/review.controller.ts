import { Request, Response } from "express";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { reviewService } from "./review.service";
import {
    getAllReviewsQuerySchema,
    getProductReviewsQuerySchema,
    reviewIdParamSchema,
    reviewProductIdParamSchema,
} from "./review.validation";

export const reviewController = {
    createReview: catchAsync(async (req: Request, res: Response) => {
        const review = await reviewService.createReview(req.user!.id, req.body, req.file);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Thanks for your review. It will be visible after approval",
            data: review,
        });
    }),

    getProductReviews: catchAsync(async (req: Request, res: Response) => {
        const { productId } = reviewProductIdParamSchema.parse(req.params);
        const query = getProductReviewsQuerySchema.parse(req.query);
        const { summary, reviews, meta } = await reviewService.getProductReviews(productId, query);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Reviews retrieved successfully",
            data: { summary, reviews },
            meta,
        });
    }),

    getMyReviews: catchAsync(async (req: Request, res: Response) => {
        const reviews = await reviewService.getMyReviews(req.user!.id);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Your reviews retrieved successfully",
            data: reviews,
        });
    }),

    updateMyReview: catchAsync(async (req: Request, res: Response) => {
        const { reviewId } = reviewIdParamSchema.parse(req.params);
        const review = await reviewService.updateMyReview(req.user!.id, reviewId, req.body, req.file);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Review updated. It will be visible after approval",
            data: review,
        });
    }),

    deleteMyReview: catchAsync(async (req: Request, res: Response) => {
        const { reviewId } = reviewIdParamSchema.parse(req.params);
        await reviewService.deleteMyReview(req.user!.id, reviewId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Review deleted successfully",
        });
    }),

    getAllReviews: catchAsync(async (req: Request, res: Response) => {
        const query = getAllReviewsQuerySchema.parse(req.query);
        const { reviews, meta } = await reviewService.getAllReviews(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Reviews retrieved successfully",
            data: reviews,
            meta,
        });
    }),

    getReviewById: catchAsync(async (req: Request, res: Response) => {
        const { reviewId } = reviewIdParamSchema.parse(req.params);
        const review = await reviewService.getReviewById(reviewId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Review retrieved successfully",
            data: review,
        });
    }),

    updateReviewStatus: catchAsync(async (req: Request, res: Response) => {
        const { reviewId } = reviewIdParamSchema.parse(req.params);
        const review = await reviewService.updateReviewStatus(reviewId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Review status updated",
            data: review,
        });
    }),

    deleteReview: catchAsync(async (req: Request, res: Response) => {
        const { reviewId } = reviewIdParamSchema.parse(req.params);
        await reviewService.deleteReview(reviewId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Review deleted successfully",
        });
    }),
};
