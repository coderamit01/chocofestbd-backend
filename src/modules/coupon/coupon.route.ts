import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { couponController } from "./coupon.controller";
import { applyCouponSchema, createCouponSchema, updateCouponSchema } from "./coupon.validation";


const router = Router();

router.post("/apply", validateRequest(applyCouponSchema), couponController.applyCoupon);
router.post("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(createCouponSchema), couponController.createCoupon);
router.get("/admin", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), couponController.getAllCoupons);
router.get("/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), couponController.getTrashedCoupons);
router.get("/admin/:couponId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), couponController.getCouponById);
router.put("/:couponId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(updateCouponSchema), couponController.updateCoupon);
router.patch("/:couponId/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), couponController.moveToTrash);
router.patch("/:couponId/restore", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), couponController.restoreCoupon);
router.delete("/:couponId", Authentication(UserRole.SUPER_ADMIN), couponController.hardDeleteCoupon);


export const couponRoutes = router;
