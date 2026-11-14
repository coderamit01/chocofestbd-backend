import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { reviewController } from "./review.controller";
import { createReviewSchema, updateReviewSchema, updateReviewStatusSchema } from "./review.validation";


const router = Router();

router.get("/product/:productId", reviewController.getProductReviews);
router.get("/my", Authentication(), reviewController.getMyReviews);
router.post("/", Authentication(), upload.single("image"), validateRequest(createReviewSchema), reviewController.createReview);
router.put("/:reviewId", Authentication(), upload.single("image"), validateRequest(updateReviewSchema), reviewController.updateMyReview);
router.delete("/:reviewId", Authentication(), reviewController.deleteMyReview);

router.get("/admin", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), reviewController.getAllReviews);
router.get("/admin/:reviewId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), reviewController.getReviewById);
router.patch("/admin/:reviewId/status", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(updateReviewStatusSchema), reviewController.updateReviewStatus);
router.delete("/admin/:reviewId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), reviewController.deleteReview);


export const reviewRoutes = router;
