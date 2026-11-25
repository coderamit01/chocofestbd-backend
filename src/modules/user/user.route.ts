import { Router } from "express";
import { UserRole } from "../../generated/prisma/enums";
import { userController } from "./user.controller";
import Authentication from "../../middlewares/Authentication";
import { validateRequest } from "../../middlewares/validateRequest";
import { upload } from "../../middlewares/upload";
import { adjustPointsSchema, updateUserSchema } from "./user.validation";


const router = Router();

const CUSTOMER_VIEWERS = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ORDER_HANDLER];
const CUSTOMER_EDITORS = [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER];

router.get("/", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.getAllUsers);
router.get("/customers", Authentication(...CUSTOMER_VIEWERS), userController.getAllCustomers);
router.get("/customers/summary", Authentication(...CUSTOMER_VIEWERS), userController.getCustomerSummary);
router.get("/customers/:userId", Authentication(...CUSTOMER_VIEWERS), userController.getCustomerProfile);
router.get("/customers/:userId/orders", Authentication(...CUSTOMER_VIEWERS), userController.getCustomerOrders);
router.patch("/customers/:userId/points", Authentication(...CUSTOMER_EDITORS), validateRequest(adjustPointsSchema), userController.adjustCustomerPoints);
router.get("/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.getTrashedUsers);
router.get("/:userId", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.getUserById);

router.put("/:userId", Authentication(), upload.single("image"), validateRequest(updateUserSchema), userController.updateUser);

router.patch("/:userId/trash", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.moveToTrash);
router.patch("/:userId/restore", Authentication(UserRole.SUPER_ADMIN, UserRole.ADMIN), userController.restoreUser);

router.delete("/:userId", Authentication(UserRole.SUPER_ADMIN), userController.hardDeleteUser);


export const userRoutes = router;
