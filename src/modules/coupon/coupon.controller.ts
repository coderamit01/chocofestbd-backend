import { Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth";
import { catchAsync } from "../../shared/catchAsync";
import { sendResponse } from "../../shared/sendResponse";
import { couponService } from "./coupon.service";
import { couponIdParamSchema, getAllCouponsQuerySchema } from "./coupon.validation";

export const couponController = {
    createCoupon: catchAsync(async (req: Request, res: Response) => {
        const coupon = await couponService.createCoupon(req.body);

        sendResponse(res, {
            statusCode: 201,
            success: true,
            message: "Coupon created successfully",
            data: coupon,
        });
    }),

    getAllCoupons: catchAsync(async (req: Request, res: Response) => {
        const query = getAllCouponsQuerySchema.parse(req.query);
        const { coupons, meta } = await couponService.getAllCoupons(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Coupons retrieved successfully",
            data: coupons,
            meta,
        });
    }),

    getTrashedCoupons: catchAsync(async (req: Request, res: Response) => {
        const query = getAllCouponsQuerySchema.parse(req.query);
        const { coupons, meta } = await couponService.getTrashedCoupons(query);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Trashed coupons retrieved successfully",
            data: coupons,
            meta,
        });
    }),

    getCouponById: catchAsync(async (req: Request, res: Response) => {
        const { couponId } = couponIdParamSchema.parse(req.params);
        const coupon = await couponService.getCouponById(couponId);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Coupon retrieved successfully",
            data: coupon,
        });
    }),

    updateCoupon: catchAsync(async (req: Request, res: Response) => {
        const { couponId } = couponIdParamSchema.parse(req.params);
        const coupon = await couponService.updateCoupon(couponId, req.body);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Coupon updated successfully",
            data: coupon,
        });
    }),

    moveToTrash: catchAsync(async (req: Request, res: Response) => {
        const { couponId } = couponIdParamSchema.parse(req.params);
        await couponService.moveToTrash(couponId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Coupon moved to trash",
        });
    }),

    restoreCoupon: catchAsync(async (req: Request, res: Response) => {
        const { couponId } = couponIdParamSchema.parse(req.params);
        const coupon = await couponService.restoreCoupon(couponId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Coupon restored successfully",
            data: coupon,
        });
    }),

    hardDeleteCoupon: catchAsync(async (req: Request, res: Response) => {
        const { couponId } = couponIdParamSchema.parse(req.params);
        await couponService.hardDeleteCoupon(couponId);

        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Coupon deleted permanently",
        });
    }),

    applyCoupon: catchAsync(async (req: Request, res: Response) => {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
        const result = await couponService.calculateDiscount(req.body, session?.user.id);

        res.setHeader("Cache-Control", "no-store");
        sendResponse(res, {
            statusCode: 200,
            success: true,
            message: "Coupon applied successfully",
            data: result,
        });
    }),
};
