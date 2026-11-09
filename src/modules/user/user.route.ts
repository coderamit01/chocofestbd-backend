import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import { userController } from "./user.controller";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { updateUserSchema } from "./user.validation";


const router = Router();

router.get("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.getAllUsers);
router.get("/customers", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.getAllCustomers);
router.get("/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.getTrashedUsers);
router.get("/:userId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.getUserById);

router.put("/:userId", Authentication(), upload.single("image"), validateRequest(updateUserSchema), userController.updateUser);

router.patch("/:userId/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.moveToTrash);
router.patch("/:userId/restore", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.restoreUser);

router.delete("/:userId", Authentication(UserRole.SUPER_ADMIN), userController.hardDeleteUser);


export const userRoutes = router;
