import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { bannerController } from "./banner.controller";
import { bannerCategorySchema, createBannerSchema, reorderBannersSchema, updateBannerSchema } from "./banner.validation";


const router = Router();

const BANNER_EDITORS = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];
const BANNER_ADMINS = [UserRole.SUPER_ADMIN, UserRole.ADMIN];

router.post("/categories", Authentication(...BANNER_EDITORS), validateRequest(bannerCategorySchema), bannerController.createBannerCategory);
router.get("/categories", Authentication(...BANNER_EDITORS), bannerController.getAllBannerCategories);
router.get("/categories/:categoryId", Authentication(...BANNER_EDITORS), bannerController.getBannerCategoryById);
router.put("/categories/:categoryId", Authentication(...BANNER_EDITORS), validateRequest(bannerCategorySchema), bannerController.updateBannerCategory);
router.delete("/categories/:categoryId", Authentication(...BANNER_ADMINS), bannerController.deleteBannerCategory);

router.post("/", Authentication(...BANNER_EDITORS), upload.single("image"), validateRequest(createBannerSchema), bannerController.createBanner);
router.get("/", bannerController.getPublicBanners);
router.get("/admin", Authentication(...BANNER_EDITORS), bannerController.getAllBanners);
router.get("/admin/:bannerId", Authentication(...BANNER_EDITORS), bannerController.getBannerById);
router.patch("/reorder", Authentication(...BANNER_EDITORS), validateRequest(reorderBannersSchema), bannerController.reorderBanners);
router.put("/:bannerId", Authentication(...BANNER_EDITORS), upload.single("image"), validateRequest(updateBannerSchema), bannerController.updateBanner);
router.delete("/:bannerId", Authentication(...BANNER_ADMINS), bannerController.deleteBanner);


export const bannerRoutes = router;
