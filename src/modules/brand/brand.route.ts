import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { brandController } from "./brand.controller";
import { createBrandSchema, updateBrandSchema } from "./brand.validation";


const router = Router();

const brandImages = upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "metaImage", maxCount: 1 },
]);

router.post("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), brandImages, validateRequest(createBrandSchema), brandController.createBrand);
router.get("/", brandController.getPublicBrands);
router.get("/admin", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), brandController.getAllBrands);
router.get("/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), brandController.getTrashedBrands);
router.get("/admin/:brandId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), brandController.getBrandById);
router.get("/:slug", brandController.getPublicBrandBySlug);
router.put("/:brandId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), brandImages, validateRequest(updateBrandSchema), brandController.updateBrand);
router.patch("/:brandId/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), brandController.moveToTrash);
router.patch("/:brandId/restore", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), brandController.restoreBrand);
router.delete("/:brandId", Authentication(UserRole.SUPER_ADMIN), brandController.hardDeleteBrand);


export const brandRoutes = router;
