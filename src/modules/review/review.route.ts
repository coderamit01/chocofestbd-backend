import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { reviewController } from "./review.controller";
import { bulkUpdateReviewStatusSchema, createReviewSchema, updateReviewSchema, updateReviewStatusSchema } from "./review.validation";


const router = Router();

router.get("/product/:productId", reviewController.getProductReviews);
router.get("/my", Authentication(), reviewController.getMyReviews);
router.post("/", Authentication(), upload.single("image"), validateRequest(createReviewSchema), reviewController.createReview);
router.put("/:reviewId", Authentication(), upload.single("image"), validateRequest(updateReviewSchema), reviewController.updateMyReview);
router.delete("/:reviewId", Authentication(), reviewController.deleteMyReview);

const REVIEW_MODERATORS = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];

router.get("/admin", Authentication(...REVIEW_MODERATORS), reviewController.getAllReviews);
router.get("/admin/summary", Authentication(...REVIEW_MODERATORS), reviewController.getReviewSummary);
router.patch("/admin/bulk/status", Authentication(...REVIEW_MODERATORS), validateRequest(bulkUpdateReviewStatusSchema), reviewController.bulkUpdateReviewStatus);
router.get("/admin/:reviewId", Authentication(...REVIEW_MODERATORS), reviewController.getReviewById);
router.patch("/admin/:reviewId/status", Authentication(...REVIEW_MODERATORS), validateRequest(updateReviewStatusSchema), reviewController.updateReviewStatus);
router.delete("/admin/:reviewId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), reviewController.deleteReview);


export const reviewRoutes = router;
