 import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { productController } from "./product.controller";
import { createProductSchema, updateProductSchema } from "./product.validation";


const router = Router();

const productImages = upload.fields([
    { name: "image", maxCount: 1 },
    { name: "gallery", maxCount: 8 },
    { name: "metaImage", maxCount: 1 },
]);

router.get("/", productController.getAllProducts);
router.get("/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), productController.getTrashedProducts);
router.post("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER), productImages, validateRequest(createProductSchema), productController.createProduct);
router.put("/:productId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER), productImages, validateRequest(updateProductSchema), productController.updateProduct);
router.patch("/:productId/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), productController.moveToTrash);
router.patch("/:productId/restore", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), productController.restoreProduct);
router.delete("/:productId", Authentication(UserRole.SUPER_ADMIN), productController.hardDeleteProduct);


export const productRoutes = router;
