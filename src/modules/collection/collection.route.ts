import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { collectionController } from "./collection.controller";
import { createCollectionSchema, setCollectionProductsSchema, updateCollectionSchema } from "./collection.validation";


const router = Router();

const collectionStaff = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];

router.get("/", collectionController.getHomeCollections);
router.get("/admin", Authentication(...collectionStaff), collectionController.getAllCollections);
router.get("/admin/:collectionId", Authentication(...collectionStaff), collectionController.getCollectionById);
router.post("/", Authentication(...collectionStaff), validateRequest(createCollectionSchema), collectionController.createCollection);
router.put("/:collectionId", Authentication(...collectionStaff), validateRequest(updateCollectionSchema), collectionController.updateCollection);
router.put("/:collectionId/products", Authentication(...collectionStaff), validateRequest(setCollectionProductsSchema), collectionController.setCollectionProducts);
router.delete("/:collectionId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), collectionController.deleteCollection);
router.get("/:slug", collectionController.getCollectionBySlug);


export const collectionRoutes = router;
