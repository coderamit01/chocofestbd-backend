import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { bannerController } from "./banner.controller";
import { bannerCategorySchema, createBannerSchema, updateBannerSchema } from "./banner.validation";


const router = Router();

router.post("/categories", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(bannerCategorySchema), bannerController.createBannerCategory);
router.get("/categories", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), bannerController.getAllBannerCategories);
router.get("/categories/:categoryId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), bannerController.getBannerCategoryById);
router.put("/categories/:categoryId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(bannerCategorySchema), bannerController.updateBannerCategory);
router.delete("/categories/:categoryId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), bannerController.deleteBannerCategory);

router.post("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), upload.single("image"), validateRequest(createBannerSchema), bannerController.createBanner);
router.get("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), bannerController.getAllBanners);
router.get("/:bannerId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), bannerController.getBannerById);
router.put("/:bannerId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), upload.single("image"), validateRequest(updateBannerSchema), bannerController.updateBanner);
router.delete("/:bannerId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), bannerController.deleteBanner);


export const bannerRoutes = router;
