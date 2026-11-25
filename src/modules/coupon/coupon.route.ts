import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { couponController } from "./coupon.controller";
import { applyCouponSchema, createCouponSchema, updateCouponSchema } from "./coupon.validation";


const router = Router();

const COUPON_EDITORS = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];

router.post("/apply", validateRequest(applyCouponSchema), couponController.applyCoupon);
router.post("/", Authentication(...COUPON_EDITORS), validateRequest(createCouponSchema), couponController.createCoupon);
router.get("/admin", Authentication(...COUPON_EDITORS), couponController.getAllCoupons);
router.get("/admin/stats", Authentication(...COUPON_EDITORS), couponController.getCouponStats);
router.get("/admin/options", Authentication(...COUPON_EDITORS), couponController.getCouponOptions);
router.get("/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), couponController.getTrashedCoupons);
router.get("/admin/:couponId", Authentication(...COUPON_EDITORS), couponController.getCouponById);
router.get("/admin/:couponId/insights", Authentication(...COUPON_EDITORS), couponController.getCouponInsights);
router.get("/admin/:couponId/orders", Authentication(...COUPON_EDITORS), couponController.getCouponOrders);
router.put("/:couponId", Authentication(...COUPON_EDITORS), validateRequest(updateCouponSchema), couponController.updateCoupon);
router.patch("/:couponId/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), couponController.moveToTrash);
router.patch("/:couponId/restore", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), couponController.restoreCoupon);
router.delete("/:couponId", Authentication(UserRole.SUPER_ADMIN), couponController.hardDeleteCoupon);


export const couponRoutes = router;
