import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { categoryController } from "./category.controller";
import { createCategorySchema, updateCategorySchema } from "./category.validation";


const router = Router();

const categoryImages = upload.fields([
    { name: "image", maxCount: 1 },
    { name: "metaImage", maxCount: 1 },
]);

router.post("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), categoryImages, validateRequest(createCategorySchema), categoryController.createCategory);
router.get("/", categoryController.getCategoryTree);
router.get("/admin", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), categoryController.getAllCategories);
router.get("/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), categoryController.getTrashedCategories);
router.get("/admin/:categoryId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), categoryController.getCategoryById);
router.get("/:slug", categoryController.getPublicCategoryBySlug);
router.put("/:categoryId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), categoryImages, validateRequest(updateCategorySchema), categoryController.updateCategory);
router.patch("/:categoryId/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), categoryController.moveToTrash);
router.patch("/:categoryId/restore", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), categoryController.restoreCategory);
router.delete("/:categoryId", Authentication(UserRole.SUPER_ADMIN), categoryController.hardDeleteCategory);


export const categoryRoutes = router;
