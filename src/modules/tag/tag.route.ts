import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { tagController } from "./tag.controller";
import { tagSchema } from "./tag.validation";


const router = Router();

router.post("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(tagSchema), tagController.createTag);
router.get("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), tagController.getAllTags);
router.get("/:tagId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), tagController.getTagById);
router.put("/:tagId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), validateRequest(tagSchema), tagController.updateTag);
router.delete("/:tagId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), tagController.deleteTag);


export const tagRoutes = router;
