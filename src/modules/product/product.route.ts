import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { productController } from "./product.controller";
import { createProductSchema } from "./product.validation";


const router = Router();

const productImages = upload.fields([
    { name: "image", maxCount: 1 },
    { name: "gallery", maxCount: 8 },
    { name: "metaImage", maxCount: 1 },
]);

router.post("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER), productImages, validateRequest(createProductSchema), productController.createProduct);


export const productRoutes = router;
